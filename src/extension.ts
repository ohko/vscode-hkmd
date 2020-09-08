// vsce package &&  code --install-extension hkmd-0.0.14.vsix
import * as vscode from 'vscode';
import * as stock from "./stock"
import * as mddoc from "./mddoc"

export async function activate(context: vscode.ExtensionContext) {
	new mddoc.TextDocumentContentProvider(context)
	new stock.StockListProvider(context)
}

export function deactivate() { }
