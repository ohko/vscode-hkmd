// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import 'axios';
import Axios from 'axios';

const url = "https://md.lyl.hk"
let cookie = ""

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "hktest" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('hkmd.search', () => {
		// The code you place here will be executed every time your command is executed

		cookie = <string>vscode.workspace.getConfiguration("hkmd").get("cookie")
		if (!cookie) return vscode.window.showInformationMessage(`setting: [hkmd.cookie] not found!`);

		// Display a message box to the user
		// vscode.window.showInformationMessage('Hello World from hktest!');

		// search("")
		vscode.window.showInputBox({
			placeHolder: 'For example: fedcba. But not: 123',
			// value: 'abcdef',
			// valueSelection: [2, 4],
			// validateInput: text => {
			// 	vscode.window.showInformationMessage(`Validating: ${text}`);
			// 	return text === '123' ? 'Not 123!' : null;
			// }
		}).then(x => {
			search(<string>x)
		})
	});

	context.subscriptions.push(disposable);
	// let a = vscode.window.createStatusBarItem()
	// setInterval(_ => {
	// 	a.text = (new Date()).toString()
	// }, 1000)
	// a.show()
}

function search(key: string) {
	Axios.get(url + "/markdown/tree?key=" + key, { headers: { cookie: cookie } })
		.then(x => {
			console.log(x.data)
			if (x.data.no != 0) return vscode.window.showInformationMessage("[Login error]" + x.data.data);

			let data = x.data.data
			let options: Array<vscode.QuickPickItem> = []
			for (let obj in data) {
				for (let i = 0; i < data[obj].length; i++) {
					let key: string = obj + "::" + data[obj][i].title
					options.push({ label: key, description: data[obj][i].id });
				}
			}

			const quickPick = vscode.window.createQuickPick();
			quickPick.items = options
			quickPick.onDidChangeSelection(selection => {
				if (selection[0]) {
					showDetail(<string>selection[0].description)
				}
				quickPick.hide()
			});
			quickPick.onDidHide(() => quickPick.dispose());
			quickPick.show();
		})
}

function showDetail(id: string) {
	Axios.get(url + "/markdown/detail?ID=" + id + "&preview=false", { headers: { cookie: cookie } })
		.then(x => {
			if (x.data.no != 0) return vscode.window.showInformationMessage(x.data.data);
			vscode.workspace.openTextDocument({ language: "markdown", content: x.data.data.Content }).then(x => {
				vscode.window.showTextDocument(x)
			})
		})
}

// this method is called when your extension is deactivated
export function deactivate() { }
