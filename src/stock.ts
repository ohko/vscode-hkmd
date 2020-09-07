import * as vscode from 'vscode';
import Axios from 'axios';

class TreeItem extends vscode.TreeItem {
   code!: string;
   name!: string;
   yestodayPrice: number;
   nowPrice: number;
   costPrice: number;
   per!: number;
   time: string;
   tips: string

   constructor(code: string, name: string, yestodayPrice: number, nowPrice: number, costPrice: number, time: string, tips: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
      super(name, collapsibleState)

      if (name.length != 4) name += "    ".repeat(4 - name.length)

      this.code = code
      this.name = name
      this.yestodayPrice = yestodayPrice
      this.nowPrice = nowPrice
      this.costPrice = costPrice
      this.time = time
      this.tips = tips
   }
}

export class StockListProvider implements vscode.TreeDataProvider<TreeItem> {
   private context: vscode.ExtensionContext;
   private panel: vscode.WebviewPanel | undefined;
   private stockList: TreeItem[] = []
   private cache: Map<string, string> = new Map<string, string>()

   constructor(context: vscode.ExtensionContext) {
      this.context = context

      vscode.window.createTreeView('stockList', { treeDataProvider: this });
      context.subscriptions.push(vscode.commands.registerCommand('stockList.click', this.itemClick.bind(this)));

      context.subscriptions.push(vscode.commands.registerCommand('hkmd.stock', _ => {
         setInterval(_ => { this.showStock(false) }, parseInt(<string>vscode.workspace.getConfiguration("hkmd").get("stockRefresh")) * 1000)
         this.showStock(true)
      }));
   }

   private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

   refresh(): void { this._onDidChangeTreeData.fire() }

   getTreeItem(element: TreeItem): TreeItem {
      // arrow
      let arrow = "     "
      if (element.costPrice > 0) {
         if (element.nowPrice > element.costPrice) arrow = " ↑ "
         else if (element.nowPrice < element.costPrice) arrow = " ↓ "
      } else {
         if (element.yestodayPrice > element.nowPrice) arrow = " ↓ "
         else if (element.yestodayPrice < element.nowPrice) arrow = " ↑ "
      }

      // diffSecond
      let now = new Date()
      let diffSecond = (now.getTime() - new Date(now.toLocaleDateString() + " " + element.time).getTime()) / 1000

      let label = (element.tips.length == 0 ? element.name : "") + arrow + "(" + element.per.toFixed(2) + "%) " + "¥" + (element.tips.length == 0 ? element.nowPrice : element.costPrice) + element.tips
      if (diffSecond > 180) label += " ∞"
      else if (diffSecond > 60) label += " +" + diffSecond.toFixed(0) + "s"
      element.label = label

      return element
   }

   getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
      let hasChildren = []
      for (let i in this.stockList) {
         if (this.stockList[i].tips.length > 0) hasChildren.push(this.stockList[i].name)
      }

      let list = []
      for (let i in this.stockList) {
         let x = this.stockList[i]
         if (!element && x.tips.length > 0) continue
         if (element && (x.tips.length == 0 || element.label!.split(" ")[0].trim() != x.name)) continue
         x.collapsibleState = vscode.TreeItemCollapsibleState.None
         if (hasChildren.includes(x.name) && !element) x.collapsibleState = vscode.TreeItemCollapsibleState.Expanded

         // per
         x.per = (x.nowPrice - x.yestodayPrice) / x.yestodayPrice * 100
         if (x.costPrice > 0) {
            x.per = (x.nowPrice - x.costPrice) / x.costPrice * 100
         }

         list.push(x)
      }

      list.sort((x, y): number => {
         if (x.name == "上证指数" || x.name == "深证指数") return 1
         if (y.name == "上证指数" || y.name == "深证指数") return 1
         return x.per > y.per ? -1 : 1
      })

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

      this.stockList.length = 0
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

         let rs = await Axios.get("http://hq.sinajs.cn/list=" + code)
         let arr = rs.data.split(",")
         let yestoday = parseFloat(arr[2])
         let price = parseFloat(arr[3])
         let time = arr[31]

         this.stockList.push(new TreeItem(code, name, yestoday, price, base, time, tips))
      }

      this.refresh()
   }

   async itemClick(x: TreeItem) {
      try { this.panel!.title = x.name } catch (e) { this.panel = vscode.window.createWebviewPanel(x.code, x.name, vscode.ViewColumn.One) }
      let html = "<script>alert(1)</script><table><tr><td><img src='http://image.sinajs.cn/newchart/min/n/" + x.code + ".gif?_+" + Math.random() + "'></td>"
      html += "<td><img src='http://image.sinajs.cn/newchart/daily/n/" + x.code + ".gif?_+" + Math.random() + "'></td></tr>"
      html += "<tr><td><img src='http://image.sinajs.cn/newchart/weekly/n/" + x.code + ".gif?_+" + Math.random() + "'></td>"
      html += "<td><img src='http://image.sinajs.cn/newchart/monthly/n/" + x.code + ".gif?_+" + Math.random() + "'></td></tr></table>"
      this.panel!.webview.html = html
   }
}