
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ExecInCodespaceOptions {
  codespaceName: string;
  command: string;
}

export async function execInCodespace(options: ExecInCodespaceOptions): Promise<{ stdout: string; stderr: string }> {
    const ghCommand = `gh codespace exec --codespace ${options.codespaceName} -- ${options.command}`;
    
    try {
        const { stdout, stderr } = await execAsync(ghCommand);
        return { stdout, stderr };
    } catch (error) {
        // execAsync throws an error that includes stdout and stderr
        const execError = error as Error & { stdout: string; stderr: string };
        console.error(`Error executing in codespace: ${execError.message}`);
        // Even on error, stdout and stderr can contain useful information
        return { stdout: execError.stdout, stderr: execError.stderr };
    }
}
