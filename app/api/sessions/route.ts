import { NextResponse } from "next/server";
import { listAllSessions, resolveSessionIdByPath } from "@/lib/session-reader";
import { getAliveRpcSessions, getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { sessionPathKey } from "@/lib/session-path";
import { resolveProject } from "@/lib/worktree";
import type { SessionInfo } from "@/lib/types";

/** Structural subset of pi's SessionEntry used for the live-session merge. */
type LiveEntry = {
  type?: string;
  message?: { role?: string; content?: unknown };
};

/**
 * pi's SessionManager buffers entries in memory and only creates the .jsonl
 * once the first assistant message lands. A session on its first run (or one
 * whose run has not produced an assistant message yet) is therefore invisible
 * to the disk scan, and would vanish from the sidebar until the run ends.
 * Merge those live, not-yet-flushed sessions into the list so they show up
 * immediately (the running badge comes from runningSessionIds).
 */
async function listLiveUnflushedSessions(alreadyListed: Set<string>): Promise<SessionInfo[]> {
  const extras: SessionInfo[] = [];
  for (const wrapper of getAliveRpcSessions()) {
    try {
      const mgr = wrapper.inner.sessionManager;
      const file = mgr.getSessionFile();
      if (!file || alreadyListed.has(sessionPathKey(file))) continue;

      const entries = mgr.getEntries() as unknown as LiveEntry[];
      const messageEntries = entries.filter((e) => e.type === "message");
      // Runtimes created only to answer ensure_session queries hold no
      // conversation — keep them out of the sidebar.
      if (messageEntries.length === 0) continue;

      const header = mgr.getHeader();
      const cwd = mgr.getCwd();
      const firstUser = messageEntries.find((e) => e.message?.role === "user");
      const content = firstUser?.message?.content;
      const firstMessage = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? (content.find((b) => b?.type === "text"))?.text ?? ""
          : "";

      let projectRoot: string | undefined;
      let worktreeBranch: string | undefined;
      try {
        const project = await resolveProject(cwd);
        projectRoot = project.projectRoot;
        if (project.isWorktree && project.branch) worktreeBranch = project.branch;
      } catch { /* fall back to cwd below */ }

      extras.push({
        path: file,
        id: mgr.getSessionId() || wrapper.sessionId,
        cwd,
        name: mgr.getSessionName() ?? undefined,
        created: header?.timestamp ?? new Date().toISOString(),
        modified: new Date().toISOString(),
        messageCount: messageEntries.length,
        firstMessage: firstMessage || "(no messages)",
        parentSessionId: header?.parentSession
          ? await resolveSessionIdByPath(header.parentSession)
          : undefined,
        projectRoot: projectRoot ?? cwd,
        ...(worktreeBranch ? { worktreeBranch } : {}),
      });
    } catch { /* skip wrappers whose manager is not inspectable */ }
  }
  return extras;
}

export async function GET() {
  try {
    const sessions = await listAllSessions();
    const listedPaths = new Set(sessions.map((s) => sessionPathKey(s.path)));
    const liveExtras = await listLiveUnflushedSessions(listedPaths);
    return NextResponse.json({
      sessions: [...sessions, ...liveExtras],
      runningSessionIds: getRunningRpcSessionIds(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
