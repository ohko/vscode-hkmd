import * as vscode from 'vscode';
import Axios from 'axios';

class TreeItem extends vscode.TreeItem {
   code!: string;
   yestodayPrice!: number;
   nowPrice!: number;
   costPrice!: number;

   constructor(label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
      super(label, collapsibleState)
   }
}

export class StockListProvider implements vscode.TreeDataProvider<TreeItem> {
   private context: vscode.ExtensionContext;
   private panel: vscode.WebviewPanel | undefined;
   private stockStatus: string[] = []
   private cache: Map<string, string> = new Map<string, string>()

   constructor(context: vscode.ExtensionContext) {
      this.context = context

      vscode.window.createTreeView('stockList', { treeDataProvider: this });
      context.subscriptions.push(vscode.commands.registerCommand('stockList.click', this.itemClick.bind(this)));

      setInterval(_ => { this.showStock(false) }, parseInt(<string>vscode.workspace.getConfiguration("hkmd").get("stockRefresh")) * 1000)
      this.showStock(true)
   }

   private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

   refresh(): void { this._onDidChangeTreeData.fire() }

   getTreeItem(element: TreeItem): TreeItem {
      return element
   }

   getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
      let hasChildren = []
      for (let i in this.stockStatus) {
         let name = this.stockStatus[i].split(" ")[0].trim()
         if (this.stockStatus[i].indexOf("[") > 0) hasChildren.push(name)
      }

      let list = []
      for (let i in this.stockStatus) {
         let x = this.stockStatus[i]
         let name = this.stockStatus[i].split(" ")[0].trim()
         if (!element && x.indexOf("[") > 0) continue
         if (element && (x.indexOf("[") < 0 || element.label!.split(" ")[0].trim() != name)) continue
         let tic = vscode.TreeItemCollapsibleState.None
         if (hasChildren.includes(name) && !element) tic = vscode.TreeItemCollapsibleState.Expanded

         let item = new TreeItem(x, tic)
         list.push(item)
      }
      return list
   }


   async showStock(force: boolean) {
      let codes = <string[]>vscode.workspace.getConfiguration("hkmd").get("stock")
      if (!codes) return vscode.window.showInformationMessage(`setting: [hkmd.stock] not found!`);

      let t = new Date()
      if (!force) {
         // 9:00 ~ 15:00
         if (t.getHours() < 9 || t.getHours() > 15) return
         // week 1~5
         if (t.getDay() == 0 || t.getDay() == 6) return
      }

      this.stockStatus.length = 0
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
         if (this.cache.has(code)) name = this.cache.get(code)!;
         else {
            let res = await Axios.get("http://smartbox.gtimg.cn/s3/?v=2&q=" + code.substr(2) + "&t=all&c=1")
            name = JSON.parse('["' + res.data.split("~")[2] + '"]')[0]
            this.cache.set(code, name)
         }
         if (!this.cache.has(name)) this.cache.set(name, code)

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
         this.stockStatus.push(msg)
      }
      this.stockStatus.sort((x, y): number => {
         if (x.substr(0, 4) == "上证指数" || x.substr(0, 4) == "深证指数") return 1
         if (y.substr(0, 4) == "上证指数" || y.substr(0, 4) == "深证指数") return 1
         let _x = x.split("(")
         let _y = y.split("(")
         return parseFloat(_x[1]) > parseFloat(_y[1]) ? -1 : 1
      })

      this.refresh()
   }

   async itemClick(x: any) {
      let name = x.label.split(" ")[0].trim()
      let code = this.cache.get(name)!
      try { this.panel!.title = name } catch (e) { this.panel = vscode.window.createWebviewPanel(code, name, vscode.ViewColumn.One) }
      let html = "<table><tr><td><img src='http://image.sinajs.cn/newchart/min/n/" + this.cache.get(x.label!.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td>"
      html += "<td><img src='http://image.sinajs.cn/newchart/daily/n/" + this.cache.get(x.label!.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td></tr>"
      html += "<tr><td><img src='http://image.sinajs.cn/newchart/weekly/n/" + this.cache.get(x.label!.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td>"
      html += "<td><img src='http://image.sinajs.cn/newchart/monthly/n/" + this.cache.get(x.label!.split(" ")[0].trim()) + ".gif?_+" + Math.random() + "'></td></tr></table>"
      this.panel!.webview.html = html
   }
}