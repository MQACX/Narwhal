import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";

import { AppComponent } from "./app.component";
import { WarningPanelComponent } from "./warning-panel/warning-panel.component";

@NgModule({
	declarations: [AppComponent, WarningPanelComponent],
	imports: [BrowserModule],
	providers: [],
	bootstrap: [AppComponent],
})
export class AppModule {}
