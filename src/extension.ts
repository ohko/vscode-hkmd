// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import 'axios';
import Axios from 'axios';

export class StockListProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	refresh(): void { this._onDidChangeTreeData.fire() }

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element }

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		return stockStatus.map(x => new vscode.TreeItem(x, vscode.TreeItemCollapsibleState.None))
	}
}

const url = "https://md.lyl.hk"
let cookie = ""
let stockStatus: string[] = []
let stockListProvider = new StockListProvider()

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	vscode.window.createTreeView('stockList', { treeDataProvider: stockListProvider });

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
	let codes = <string[]>vscode.workspace.getConfiguration("hkmd").get("stock")
	if (!codes) return vscode.window.showInformationMessage(`setting: [hkmd.stock] not found!`);

	let t = new Date()
	if (!force) {
		// 9:00 ~ 15:00
		if (t.getHours() < 9 || t.getHours() > 15) return
		// week 1~5
		if (t.getDay() == 0 || t.getDay() == 6) return
	}

	// let html = []

	stockStatus.length = 0
	for (let i in codes) {
		let code = codes[i]

		let res = await Axios.get("http://smartbox.gtimg.cn/s3/?v=2&q=" + code.substr(2) + "&t=all&c=1")
		let name = JSON.parse('["' + res.data.split("~")[2] + '"]')[0]

		let rs = await Axios.get("http://hq.sinajs.cn/list=" + code)
		let arr = rs.data.split(",")
		let price = arr[3]
		let yestoday = arr[2]
		let time = "[" + arr[31] + "] "
		if (parseInt(i) > 0) time = ""
		let per = (price - yestoday) / yestoday * 100
		// html.push(time + name + (yestoday > price ? " ↓" : " ↑") + price + " (" + per.toFixed(2) + "%)")
		if (name.length != 4) name += "    ".repeat(4 - name.length)
		let msg = (yestoday > price ? "↓ " : "↑ ") + name + " ¥" + price + " (" + per.toFixed(2) + "%) " + arr[31]
		stockStatus.push(msg)
	}

	// vscode.window.setStatusBarMessage(html.join(" | "))
	stockListProvider.refresh()
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
