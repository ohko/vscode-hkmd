import * as vscode from 'vscode';
import Axios from 'axios';
import * as path from 'path';

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

      if (name == "undefined") name = code
      if (name.length < 4) name += "....".repeat(4 - name.length)

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
   private stop: boolean
   private timer!: NodeJS.Timeout

   constructor(context: vscode.ExtensionContext) {
      this.context = context
      this.stop = true

      vscode.window.createTreeView('stockList', { treeDataProvider: this });
      context.subscriptions.push(vscode.commands.registerCommand('stockList.click', this.itemClick.bind(this)));

      context.subscriptions.push(vscode.commands.registerCommand('hkmd.stock', _ => {
         if (!this.stop) {
            this.stop = true
            clearTimeout(this.timer)

            this.stockList.length = 0
            this.refresh()
            return
         }
         this.stop = false
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
      let diffPercent = <number>vscode.workspace.getConfiguration("hkmd").get("stockDiffPercent", 1.0111)

      let per2 = (element.nowPrice - element.yestodayPrice) / element.yestodayPrice * 100
      let label = element.name + " (" + element.per.toFixed(2) + "% / " + per2.toFixed(2) + "%) ¥" + element.nowPrice
      if (element.tips.length != 0) label = element.name + " (" + element.per.toFixed(2) + "%) ¥" + element.costPrice + "/" + (element.costPrice * diffPercent).toFixed(3) + element.tips
      if (diffSecond > 180) label += " ∞"
      else if (diffSecond > 60) label += " +" + diffSecond.toFixed(0) + "s"
      element.label = label
      if (element.per > 0) element.iconPath = path.join(__filename, '..', '..', 'media', 'arrow-up.svg')
      else if (element.per < 0) element.iconPath = path.join(__filename, '..', '..', 'media', 'arrow-down.svg')

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


   async showStock(force: boolean = false) {
      let codes = <string[]>vscode.workspace.getConfiguration("hkmd").get("stock", ["sh000001"])
      if (!codes) return vscode.window.showInformationMessage(`setting: [hkmd.stock] not found!`);

      let t = new Date()
      if (!force) {
         // 9:00 ~ 15:00
         if (t.getHours() < 9 || t.getHours() > 15) return
         // week 1~5
         if (t.getDay() == 0 || t.getDay() == 6) return
      }

      this.stockList.length = 0
      try {
         for (let i in codes) {
            if (this.stop) break

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
               if (name == "undefined") {
                  res = await Axios.get("http://news.10jqka.com.cn/public/index_keyboard_" + code.substr(2) + "_stock,hk,usa_5_jsonp.html",
                     { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36" } })
                  name = JSON.parse('["' + res.data.split(" ")[1] + '"]')[0]
               }
               this.cache.set(code, name)
            }

            // https://cloud.tencent.com/developer/article/1534790
            let rs = await Axios.get("http://hq.sinajs.cn/list=" + code)
            let arr = rs.data.split(",")
            let yestoday = parseFloat(arr[2])
            let price = parseFloat(arr[3])
            let time = arr[31]

            let item = new TreeItem(code, name, yestoday, price, base, time, tips)
            item.command = { title: "detail", command: "stockList.click", arguments: [item] }
            this.stockList.push(item)
         }
      } catch (e) { }

      if (!this.stop) {
         this.refresh()
         this.timer = setTimeout(this.showStock.bind(this), <number>vscode.workspace.getConfiguration("hkmd").get("stockRefresh", 5) * 1000)
      }
   }

   async itemClick(x: TreeItem) {
      try { this.panel!.title = x.name } catch (e) { this.panel = vscode.window.createWebviewPanel("x.code", x.name, vscode.ViewColumn.One, { enableScripts: true }) }

      let cczq = "https://chuancai.mdengta.com/intelligentDiagnosis.html?seccode=" + (x.code.substr(0, 2) == "sz" ? "0001" : "0101") + (x.code.substr(2)) + "&secname=" + (x.name) + "&webviewType=userActivitesType&dt_page_type=11&dt_sbt=2&fromTool=true"
      let lbty = "https://huaanweb.wmcloud.com/stockDiagnose?stockId=" + (x.code.substr(2)) + "&stockName=" + (x.name) + "&hasPermission=true&roboApp=1"
      let html = ""
      html += "<a href='" + cczq + "'>川财证券</a>"
      html += " | <a href='" + lbty + "'>萝卜投研</a>"
      html += " | <a href='http://quote.eastmoney.com/" + x.code + ".html'>东方财富</a>"
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
      html += "<td><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=&_=" + Math.random() + "'></td><td>"

      try {
         // https://cloud.tencent.com/developer/article/1534790
         let rs = await Axios.get("http://hq.sinajs.cn/list=" + x.code)
         let arr = rs.data.split(",")
         let now = arr[3]
         let buy1 = [arr[11], (arr[10] / 100).toFixed(0)]
         let buy2 = [arr[13], (arr[12] / 100).toFixed(0)]
         let buy3 = [arr[15], (arr[14] / 100).toFixed(0)]
         let buy4 = [arr[17], (arr[16] / 100).toFixed(0)]
         let buy5 = [arr[19], (arr[18] / 100).toFixed(0)]
         let sell1 = [arr[21], (arr[20] / 100).toFixed(0)]
         let sell2 = [arr[23], (arr[22] / 100).toFixed(0)]
         let sell3 = [arr[25], (arr[24] / 100).toFixed(0)]
         let sell4 = [arr[27], (arr[26] / 100).toFixed(0)]
         let sell5 = [arr[29], (arr[28] / 100).toFixed(0)]
         let bsell = "", bbuy = ""
         if (now == sell1[0]) bsell = "style='font-weight:bold'"
         if (now == buy1[0]) bbuy = "style='font-weight:bold'"
         html += "<table border='1'><tr><td>" + sell5[0] + "</td><td align='right'>" + sell5[1] + "</td></tr><tr><td>" + sell4[0] + "</td><td align='right'>" + sell4[1] + "</td></tr><tr><td>" + sell3[0] + "</td><td align='right'>" + sell3[1] + "</td></tr><tr><td>" + sell2[0] + "</td><td align='right'>" + sell2[1] + "</td></tr><tr " + bsell + "><td>" + sell1[0] + "</td><td align='right'>" + sell1[1] + "</td></tr><tr><td colspan='2'></td></tr><tr " + bbuy + "><td>" + buy1[0] + "</td><td align='right'>" + buy1[1] + "</td></tr><tr><td>" + buy2[0] + "</td><td align='right'>" + buy2[1] + "</td></tr><tr><td>" + buy3[0] + "</td><td align='right'>" + buy3[1] + "</td></tr><tr><td>" + buy4[0] + "</td><td align='right'>" + buy4[1] + "</td></tr><tr><td>" + buy5[0] + "</td><td align='right'>" + buy5[1] + "</td></tr></table>"
      } catch (e) { }

      html += "</td></tr><tr><td valign='top'><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=W'></td>"
      html += "<td><img src='http://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=" + code + "&imageType=KXL&Formula=MACD&type=M'></td></tr></table>"

      html += "<iframe src='" + cczq + "' style='width:375px;height:3000px'></iframe>"
      html += "<iframe src='" + lbty + "' style='width:375px;height:3000px'></iframe>"

      this.panel!.webview.html = html
   }
}