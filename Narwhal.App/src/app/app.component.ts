import { Component, OnInit } from "@angular/core";

import {
	Map,
	supported,
	MapboxOptions,
	NavigationControl,
	Popup,
	GeoJSONSource,
} from "mapbox-gl";

import { FeatureCollection, Feature } from "geojson";
import { TrackingPoint } from "./models/tracking-point";

@Component({
	selector: "app-root",
	templateUrl: "./app.component.html",
	styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
	map: Map;
	hardwareRendering = supported({ failIfMajorPerformanceCaveat: true });

	ngOnInit() {
		const mapboxOptions: MapboxOptions = {
			container: "map",
			style: {
				version: 8,
				sources: {
					"osm-source": {
						type: "raster",
						tiles: [
							"https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
						],
						tileSize: 256,
					},
				},
				layers: [
					{
						id: "osm-layer",
						type: "raster",
						source: "osm-source",
						minzoom: 0,
						maxzoom: 22,
					},
				],
			},

			attributionControl: false,
			antialias: this.hardwareRendering,
		};

		mapboxOptions.center = [0, 30];
		mapboxOptions.zoom = 2;

		// *******************************************************************
		// Mapbox GL initialization
		// *******************************************************************

		this.map = new Map(mapboxOptions);
		this.map.addControl(new NavigationControl());

		this.map.on("mousemove", (e: mapboxgl.MapMouseEvent) => {
			const level = Math.floor(e.target.getZoom());
			const divider = Math.pow(2, level);

			const resultX = (e.lngLat.lng + 180) / (360 / divider);
			const resultY =
				((1 -
					Math.log(
						Math.tan((e.lngLat.lat * Math.PI) / 180) +
							1 / Math.cos((e.lngLat.lat * Math.PI) / 180)
					) /
						Math.PI) /
					2) *
				divider;
			const resultScale = 500000000 / Math.pow(2, level + 1);

			document.getElementById("info").innerHTML =
				JSON.stringify({
					lat: Math.round(e.lngLat.lat * 10000) / 10000,
					lon: Math.round(e.lngLat.lng * 10000) / 10000,
				}) +
				"\n" +
				JSON.stringify({
					z: level,
					x: Math.floor(resultX),
					y: Math.floor(resultY),
					scale: Math.floor(resultScale),
				});
		});

		// *******************************************************************
		// WebGL support
		// *******************************************************************

		const banner = document.getElementsByClassName("banner-webgl")[0];

		if (supported({ failIfMajorPerformanceCaveat: true })) {
			banner.getElementsByClassName("status")[0].innerHTML = "WebGL GPU";
			banner.className = "banner-webgl valid";
		} else if (supported({ failIfMajorPerformanceCaveat: false })) {
			banner.getElementsByClassName("status")[0].innerHTML = "WebGL CPU";
			banner.className = "banner-webgl warning";
		} else {
			banner.getElementsByClassName("status")[0].innerHTML =
				"WebGL not supported";
			banner.className = "banner-webgl danger";
		}

		// *******************************************************************
		// NavWarnings source
		// *******************************************************************

		this.map.on("load", function () {
			this.addSource("navwarnings-source", {
				type: "geojson",
				data: {
					type: "FeatureCollection",
					features: [],
				},
			});

			this.addLayer({
				id: "navwanings-layer",
				type: "circle",
				source: "navwarnings-source",
				paint: {
					"circle-radius": 4,
					"circle-color": "#007cbf",
					"circle-stroke-color": "#ffffff",
					"circle-stroke-width": 1,
					"circle-stroke-opacity": 0.5,
				},
			});

			fetch("/api/navwarnings/get")
				.then((response) => response.json())
				.then((data) => {
					data = data.map((d) => d.data);

					const geoJson = {
						type: "FeatureCollection",
						features: data,
					};

					this.getSource("navwarnings-source").setData(geoJson);
				});
		});

		// *******************************************************************
		// Tracking source
		// *******************************************************************

		this.map.on("load", () => {
			this.map.addSource("tracking-source", {
				type: "geojson",
				data: {
					type: "FeatureCollection",
					features: [],
				},
			});

			this.map.addLayer({
				id: "tracking-layer",
				type: "line",
				source: "tracking-source",
				paint: {
					"line-width": 2,
					"line-color": ["get", "color"],
				},
			});

			this.map.addLayer({
				id: "tracking-points-layer",
				type: "circle",
				source: "tracking-source",
				paint: {
					"circle-radius": 3.5,
					"circle-color": ["get", "color"],
					"circle-stroke-color": "#000000",
					"circle-stroke-width": 1,
					"circle-stroke-opacity": 0.5,
				},
			});

			fetch("/api/tracking/get?from=2018-04-23&to=2018-04-24")
				.then((response) => response.json())
				.then((data: TrackingPoint[]) => {
					const groupedData = this.groupBy(data, (d) => d.vessel);

					const lines: Feature[] = [];

					for (const [vessel, points] of Object.entries(
						groupedData
					)) {
						lines.push({
							type: "Feature",
							properties: {
								color:
									"hsl(" +
									(((vessel as any) * 1) % 255) +
									", 50%, 50%)",
								description: "Vessel " + vessel,
							},
							geometry: {
								type: "LineString",
								coordinates: points.map((p) => [
									p.longitude,
									p.latitude,
								]),
							},
						});
					}

					var geoJson: FeatureCollection = {
						type: "FeatureCollection",
						features: lines,
					};

					(
						this.map.getSource("tracking-source") as GeoJSONSource
					).setData(geoJson);
				});

			var popup = new Popup({
				closeButton: false,
				closeOnClick: false,
			});

			this.map.on("mouseenter", "tracking-points-layer", (e) => {
				// Change the cursor style as a UI indicator.
				this.map.getCanvas().style.cursor = "pointer";

				var description = e.features[0].properties.description;

				// Populate the popup and set its coordinates
				// based on the feature found.
				popup.setLngLat(e.lngLat).setHTML(description).addTo(this.map);
			});

			this.map.on("mouseleave", "tracking-points-layer", () => {
				this.map.getCanvas().style.cursor = "";
				popup.remove();
			});
		});
	}

	private groupBy<T>(arr: T[], fn: (item: T) => any) {
		return arr.reduce<Record<string, T[]>>((prev, curr) => {
			const groupKey = fn(curr);
			const group = prev[groupKey] || [];
			group.push(curr);
			return { ...prev, [groupKey]: group };
		}, {});
	}
}
