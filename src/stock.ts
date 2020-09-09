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
   private timer!: NodeJS.Timeout

   constructor(context: vscode.ExtensionContext) {
      this.context = context

      vscode.window.createTreeView('stockList', { treeDataProvider: this });
      context.subscriptions.push(vscode.commands.registerCommand('stockList.click', this.itemClick.bind(this)));

      context.subscriptions.push(vscode.commands.registerCommand('hkmd.stock', _ => {
         if (this.timer && this.timer.hasRef()) {
            clearInterval(this.timer)

            this.stockList.length = 0
            this.refresh()
            return
         }
         this.timer = setInterval(_ => { this.showStock(false) }, parseInt(<string>vscode.workspace.getConfiguration("hkmd").get("stockRefresh")) * 1000)
         this.showStock(true)
      }));
   }

   private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

   refresh(): void { this._onDidChangeTreeData.fire() }

   getTreeItem(element: TreeItem): TreeItem {
      // arrow
      // let arrow = "     "
      // if (element.costPrice > 0) {
      //    if (element.nowPrice > element.costPrice) arrow = " ↑ "
      //    else if (element.nowPrice < element.costPrice) arrow = " ↓ "
      // } else {
      //    if (element.yestodayPrice > element.nowPrice) arrow = " ↓ "
      //    else if (element.yestodayPrice < element.nowPrice) arrow = " ↑ "
      // }

      // diffSecond
      let now = new Date()
      let diffSecond = (now.getTime() - new Date(now.toLocaleDateString() + " " + element.time).getTime()) / 1000

      let per2 = (element.nowPrice - element.yestodayPrice) / element.yestodayPrice * 100
      let label = element.name + " (" + element.per.toFixed(2) + "% / " + per2.toFixed(2) + "%) ¥" + element.nowPrice
      if (element.tips.length != 0) label = " (" + element.per.toFixed(2) + "%) ¥" + element.costPrice + element.tips
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

         x.tooltip = x.code
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

         // https://cloud.tencent.com/developer/article/1534790
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

      let html = "<a href='http://quote.eastmoney.com/" + x.code + ".html'>东方财富</a>"
      html += " | <a href='https://finance.sina.com.cn/realstock/company/" + x.code + "/nc.shtml'>新浪财经</a>"
      html += " | <a href='http://stockpage.10jqka.com.cn/" + (x.code.substr(2)) + "/'>同花顺</a>"
      html += " | <a href='http://doctor.10jqka.com.cn/" + (x.code.substr(2)) + "/'>牛叉诊股</a>"
      html += " | <a href='https://robo.datayes.com/v2/stock/" + (x.code.substr(2)) + "/overview#STOCK_TREND'>萝卜投研</a>"
      html += " | <a href='http://gu.qq.com/" + x.code + "/gp'>腾讯证券</a>"
      html += " | <a href='http://gu.qq.com/" + x.code + "/gp/news'>腾讯证券::个股新闻</a>"
      html += " | <a href='http://gu.qq.com/" + x.code + "/gp/notice'>腾讯证券::个股公告</a>"

      // sina
      // http://image.sinajs.cn/newchart/min/n/sh6033631.gif
      // html += "<table><tr><td><img src='http://image.sinajs.cn/newchart/min/n/" + x.code + ".gif?_+" + Math.random() + "'></td>"
      // html += "<td><img src='http://image.sinajs.cn/newchart/daily/n/" + x.code + ".gif?_+" + Math.random() + "'></td></tr>"
      // html += "<tr><td><img src='http://image.sinajs.cn/newchart/weekly/n/" + x.code + ".gif?_+" + Math.random() + "'></td>"
      // html += "<td><img src='http://image.sinajs.cn/newchart/monthly/n/" + x.code + ".gif?_+" + Math.random() + "'></td></tr></table>"
      // this.panel!.webview.html = html

      // eastmoney
      // http://webquotepic.eastmoney.com/GetPic.aspx?id=6033631&imageType=r
      // http://webquotepic.eastmoney.com/GetPic.aspx?id=6033631&imageType=rc
      // http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=1.603363&imageType=KXL&Formula=MACD&type=
      // http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=1.603363&imageType=KXL&Formula=MACD&type=W
      // http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=1.603363&imageType=KXL&Formula=MACD&type=M
      let code = (x.code.substr(0, 2) == "sz" ? "0." : "1.") + x.code.substr(2)
      html += "<table><tr><td><img src='http://webquotepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=rc&_=" + Math.random() + "'></td>"
      html += "<td><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=&_=" + Math.random() + "'></td></tr>"
      html += "<tr><td><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=W&_=" + Math.random() + "'></td>"
      html += "<td><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=M&_=" + Math.random() + "'></td></tr></table>"
      this.panel!.webview.html = html
   }
}