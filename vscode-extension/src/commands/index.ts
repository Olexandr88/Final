/**
 * Command handlers for LLM Framework extension
 */

import * as vscode from 'vscode';
import { AIBridgeClient } from '../aiBridgeClient';
import { ChatPanelProvider } from '../chatPanelProvider';

export async function explainCode(client: AIBridgeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('Please select code to explain');
    return;
  }

  const code = editor.document.getText(selection);
  const language = editor.document.languageId;

  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Explaining code...',
        cancellable: false
      },
      async () => {
        return await client.sendRequest('task.explain', {
          code,
          language,
          prompt: 'Explain this code in detail, including what it does, how it works, and any potential issues.'
        });
      }
    );

    showResponseInNewDocument(response.explanation || response.data, 'markdown');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to explain code: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function refactorCode(client: AIBridgeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('Please select code to refactor');
    return;
  }

  const code = editor.document.getText(selection);
  const language = editor.document.languageId;

  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refactoring code...',
        cancellable: false
      },
      async () => {
        return await client.sendRequest('task.refactor', {
          code,
          language,
          prompt: 'Refactor this code to improve readability, performance, and follow best practices.'
        });
      }
    );

    const refactoredCode = response.refactored || response.code || response.data;

    // Ask user if they want to replace
    const choice = await vscode.window.showInformationMessage(
      'Refactored code ready. Replace selection?',
      'Replace',
      'Show in New File',
      'Cancel'
    );

    if (choice === 'Replace') {
      await editor.edit(editBuilder => {
        editBuilder.replace(selection, refactoredCode);
      });
    } else if (choice === 'Show in New File') {
      showResponseInNewDocument(refactoredCode, language);
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to refactor code: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function generateTests(client: AIBridgeClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('Please select code to generate tests for');
    return;
  }

  const code = editor.document.getText(selection);
  const language = editor.document.languageId;

  // Determine test framework based on project
  const testFramework = await detectTestFramework();

  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating tests...',
        cancellable: false
      },
      async () => {
        return await client.sendRequest('task.generate-tests', {
          code,
          language,
          testFramework,
          prompt: `Generate comprehensive unit tests for this code using ${testFramework}. Include edge cases and error handling.`
        });
      }
    );

    const tests = response.tests || response.code || response.data;
    showResponseInNewDocument(tests, language);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to generate tests: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function askAgent(
  client: AIBridgeClient,
  chatProvider: ChatPanelProvider
): Promise<void> {
  const question = await vscode.window.showInputBox({
    prompt: 'Ask the AI agent a question',
    placeHolder: 'e.g., How do I implement authentication in Node.js?'
  });

  if (!question) {
    return;
  }

  // Get current editor context
  const editor = vscode.window.activeTextEditor;
  const context = editor
    ? {
        file: editor.document.fileName,
        language: editor.document.languageId,
        selection: editor.document.getText(editor.selection)
      }
    : undefined;

  try {
    chatProvider.sendMessage(question, context);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function detectTestFramework(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return 'jest'; // Default
  }

  try {
    const packageJsonUri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      'package.json'
    );
    const packageJsonData = await vscode.workspace.fs.readFile(packageJsonUri);
    const packageJson = JSON.parse(packageJsonData.toString());

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Detect test framework
    if (deps.mocha) {
      return 'mocha';
    }
    if (deps.jest) {
      return 'jest';
    }
    if (deps.vitest) {
      return 'vitest';
    }
    if (deps['@playwright/test']) {
      return 'playwright';
    }
  } catch {
    // Ignore errors, use default
  }

  return 'jest';
}

async function showResponseInNewDocument(
  content: string,
  language: string
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language
  });
  await vscode.window.showTextDocument(doc);
}
