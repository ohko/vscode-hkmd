// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import 'axios';
import Axios from 'axios';
// import * as path from 'path';

export class StockListProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	refresh(): void { this._onDidChangeTreeData.fire() }

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		let hasChildren = []
		for (let i in stockStatus) {
			let name = stockStatus[i].split(" ")[0].trim()
			if (stockStatus[i].indexOf("[") > 0) hasChildren.push(name)
		}

		let list = []
		for (let i in stockStatus) {
			let x = stockStatus[i]
			let name = stockStatus[i].split(" ")[0].trim()
			// let arrow = ""
			if (!element && x.indexOf("[") > 0) continue
			if (element && (x.indexOf("[") < 0 || element.label!.split(" ")[0].trim() != name)) continue
			let tic = vscode.TreeItemCollapsibleState.None
			if (hasChildren.includes(name) && !element) tic = vscode.TreeItemCollapsibleState.Expanded

			// if (x.indexOf("↑") > 0) arrow = path.join(__filename, '..', '..', "media", "arrow-up.svg")
			// else if (x.indexOf("↓") > 0) arrow = path.join(__filename, '..', '..', "media", "arrow-down.svg")
			// x = x.replace(" ↑ ", " ")
			// x = x.replace(" ↓ ", " ")

			let item = new vscode.TreeItem(x, tic)
			// item.iconPath = arrow
			list.push(item)
		}
		return list
	}
}

const url = "https://md.lyl.hk"
let cookie = ""
let stockStatus: string[] = []
let stockListProvider = new StockListProvider()
let cache: Map<string, string> = new Map<string, string>()
let panel: vscode.WebviewPanel

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

	context.subscriptions.push(vscode.commands.registerCommand('hkmd.search', async () => {
		cookie = <string>vscode.workspace.getConfiguration("hkmd").get("cookie")
		if (!cookie) return vscode.window.showInformationMessage(`setting: [hkmd.cookie] not found!`);

		search(<string>await vscode.window.showInputBox({ placeHolder: 'For example: abc', }))
	}));

	context.subscriptions.push(vscode.commands.registerCommand('stockList.click', async (x) => {
		let name = x.label.split(" ")[0].trim()
		let code = cache.get(name)!
		try { panel.title = name } catch (e) { panel = vscode.window.createWebviewPanel(code, name, vscode.ViewColumn.One) }
		let html = "<table><tr><td><img src='http://image.sinajs.cn/newchart/min/n/" + cache.get(x.label.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td>"
		html += "<td><img src='http://image.sinajs.cn/newchart/daily/n/" + cache.get(x.label.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td></tr>"
		html += "<tr><td><img src='http://image.sinajs.cn/newchart/weekly/n/" + cache.get(x.label.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td>"
		html += "<td><img src='http://image.sinajs.cn/newchart/monthly/n/" + cache.get(x.label.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td></tr></table>"
		panel.webview.html = html
	}));

	setInterval(_ => { showStock(false) }, parseInt(<string>vscode.workspace.getConfiguration("hkmd").get("stockRefresh")) * 1000)
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
		let base = 0.0
		let tips = ""
		if (code.indexOf(",") > 0) {
			let tmp = code.split(",")
			code = tmp[0].trim()
			base = parseFloat(tmp[1].trim())
			if (tmp.length == 3) tips = " [" + tmp[2].trim() + "]"
		}

		let name: string
		if (cache.has(code)) name = cache.get(code)!;
		else {
			let res = await Axios.get("http://smartbox.gtimg.cn/s3/?v=2&q=" + code.substr(2) + "&t=all&c=1")
			name = JSON.parse('["' + res.data.split("~")[2] + '"]')[0]
			cache.set(code, name)
		}
		if (!cache.has(name)) cache.set(name, code)

		let rs = await Axios.get("http://hq.sinajs.cn/list=" + code)
		let arr = rs.data.split(",")
		let price = arr[3]
		let yestoday = arr[2]
		if (base > 0) yestoday = base
		let time = arr[31]
		// if (parseInt(i) > 0) time = ""
		let now = new Date()
		let diffSecond = (now.getTime() - new Date(now.toLocaleDateString() + " " + time).getTime()) / 1000
		let per = (price - yestoday) / yestoday * 100
		// html.push(time + name + (yestoday > price ? " ↓" : " ↑") + price + " (" + per.toFixed(2) + "%)")
		if (name.length != 4) name += "    ".repeat(4 - name.length)
		let arrow = " "
		if (yestoday > price) arrow = " ↓ "
		else if (yestoday < price) arrow = " ↑ "
		let msg = name + arrow + "(" + per.toFixed(2) + "%) " + "¥" + price + tips
		if (diffSecond > 180) msg += " ∞"
		else if (diffSecond > 60) msg += " +" + diffSecond.toFixed(0) + "s"
		stockStatus.push(msg)
	}
	stockStatus.sort((x, y): number => {
		if (x.substr(0, 4) == "上证指数" || x.substr(0, 4) == "深证指数") return 1
		if (y.substr(0, 4) == "上证指数" || y.substr(0, 4) == "深证指数") return 1
		let _x = x.split("(")
		let _y = y.split("(")
		return parseFloat(_x[1]) > parseFloat(_y[1]) ? -1 : 1
	})

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
