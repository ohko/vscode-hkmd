// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as stock from "./stock"
import * as mddoc from "./mddoc"

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	new mddoc.TextDocumentContentProvider(context)
	new stock.StockListProvider(context)
}

export function deactivate() { }
