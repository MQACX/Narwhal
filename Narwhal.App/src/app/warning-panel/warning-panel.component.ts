import { Component, Input } from "@angular/core";
import { WarningIntersection } from "../models/warning-intersection";

@Component({
	selector: "app-warning-panel",
	templateUrl: "./warning-panel.component.html",
	styleUrls: ["./warning-panel.component.scss"],
})
export class WarningPanelComponent {
	@Input() warnings: WarningIntersection[];
}
