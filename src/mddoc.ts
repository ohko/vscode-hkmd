import * as vscode from 'vscode';
import Axios from 'axios';

const url = "https://md.lyl.hk"

export class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
   private context: vscode.ExtensionContext;
   private cookie: string = "";

   constructor(context: vscode.ExtensionContext) {
      this.context = context
      context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("mddoc", this));
      context.subscriptions.push(vscode.commands.registerCommand('hkmd.search', this.searchCommand.bind(this)));
   }

   onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
   onDidChange = this.onDidChangeEmitter.event;

   provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
      return (async _ => {
         let x = await Axios.get(url + "/markdown/detail?ID=" + uri.path + "&preview=false", { headers: { cookie: this.cookie } })
         if (x.data.no != 0) return x.data.data;
         return x.data.data.Content;
      })()
   }

   async searchCommand() {
      this.cookie = <string>vscode.workspace.getConfiguration("hkmd").get("cookie")
      if (!this.cookie) return vscode.window.showInformationMessage(`setting: [hkmd.cookie] not found!`);

      let key = <string>await vscode.window.showInputBox({ placeHolder: 'For example: abc', })

      let x = await Axios.get(url + "/markdown/tree?key=" + key, { headers: { cookie: this.cookie } })
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
}
