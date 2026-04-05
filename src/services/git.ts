import simpleGit, { type SimpleGit } from "simple-git";
import { existsSync } from "fs";

export async function initRepo(dir: string): Promise<SimpleGit> {
  const git = simpleGit(dir);
  if (!existsSync(`${dir}/.git`)) {
    await git.init();
    await git.addConfig("user.email", "kb-platform@local");
    await git.addConfig("user.name", "KB Platform");
  }
  return git;
}

export async function commitAll(
  dir: string,
  message: string
): Promise<string | null> {
  const git = simpleGit(dir);
  await git.add("-A");
  const status = await git.status();
  if (status.isClean()) return null;
  const result = await git.commit(message);
  return result.commit;
}
