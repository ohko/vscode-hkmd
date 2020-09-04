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

	// register a content provider for the cowsay-scheme
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("mddoc", new class implements vscode.TextDocumentContentProvider {

		// emitter and its event
		onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
		onDidChange = this.onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
			return (async _ => {
				let x = await Axios.get(url + "/markdown/detail?ID=" + uri.path + "&preview=false", { headers: { cookie: cookie } })
				if (x.data.no != 0) return x.data.data;
				return x.data.data.Content;
			})()
		}
	}));

	let disposable = vscode.commands.registerCommand('hkmd.search', async () => {
		cookie = <string>vscode.workspace.getConfiguration("hkmd").get("cookie")
		if (!cookie) return vscode.window.showInformationMessage(`setting: [hkmd.cookie] not found!`);

		search(<string>await vscode.window.showInputBox({ placeHolder: 'For example: abc', }))
	});

	context.subscriptions.push(disposable);

	setInterval(_ => { showStock(false) }, 15000)
	showStock(true)
}

async function showStock(force: boolean) {
	let code = <string>vscode.workspace.getConfiguration("hkmd").get("stock")
	if (!code) return vscode.window.showInformationMessage(`setting: [hkmd.stock] not found!`);

	let t = new Date()
	if (!force && (t.getHours() < 9 || t.getHours() > 15)) return
	let rs = await Axios.get("http://hq.sinajs.cn/list=" + code)
	let arr = rs.data.split(",")
	let name = arr[0]
	let price = arr[3]
	let yestoday = arr[2]
	let tt = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().substr(11, 8)
	let per = (price - yestoday) / yestoday * 100
	vscode.window.setStatusBarMessage("[" + tt + "] " + code + " [" + per.toFixed(2) + "%] " + (yestoday > price ? "↓" : "↑") + price)
}

async function search(key: string) {
	let x = await Axios.get(url + "/markdown/tree?key=" + key, { headers: { cookie: cookie } })
	// console.log(x.data)
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
	quickPick.onDidChangeSelection(async selection => {
		if (selection[0]) {
			let uri = vscode.Uri.parse("mddoc:" + selection[0].description)
			let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
			vscode.languages.setTextDocumentLanguage(doc, "markdown")
			await vscode.window.showTextDocument(doc, { preview: true });
		}
		// vscode.commands.executeCommand("markdown.showPreviewToSide")
		vscode.commands.executeCommand("markdown.showPreview")
		quickPick.hide()
	});
	quickPick.onDidHide(() => quickPick.dispose());
	quickPick.show();
}

export function deactivate() { }
