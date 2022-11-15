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
import { WarningIntersection } from "./models/warning-intersection";

@Component({
	selector: "app-root",
	templateUrl: "./app.component.html",
	styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
	map: Map;
	hardwareRendering = supported({ failIfMajorPerformanceCaveat: true });

	warnings: WarningIntersection[] = [
		{
			vessel1: "test1",
			vessel2: "test2",
			time: new Date(2022, 10, 4, 5, 12, 49),
		},
		{
			vessel1: "test2",
			vessel2: "test4",
			time: new Date(2022, 10, 5, 9, 30, 5),
		},
	];

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
						// this.warnings = this.getIntersections(
						// 	points,
						// 	Object.entries(groupedData).filter(
						// 		(x) => x[0] !== vessel
						// 	)
						// );

						const totalDistanceKm = this.getTotalDistanceKm(points);
						const totalDurationHours =
							this.getTotalDurationHours(points);
						const averageSpeed = this.getAverageSpeed(
							totalDistanceKm,
							totalDurationHours
						);

						lines.push({
							type: "Feature",
							properties: {
								color:
									"hsl(" +
									(((vessel as any) * 1) % 255) +
									", 50%, 50%)",
								description: "Vessel " + vessel,
								totalDistance: `Total Distance ${totalDistanceKm.toFixed(
									6
								)} km`,
								averageSpeed: `Average Speed ${averageSpeed.toFixed(
									6
								)} km/h`,
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

				const prop = e.features[0].properties;

				const html = `
				<div>${prop.description}</div>
				<div>${prop.totalDistance}</div>
				<div>${prop.averageSpeed}</div>
				`;

				// Populate the popup and set its coordinates
				// based on the feature found.
				popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
			});

			this.map.on("mouseleave", "tracking-points-layer", () => {
				this.map.getCanvas().style.cursor = "";
				popup.remove();
			});
		});
	}

	/**
	 * Get the total hours that have passed between the first and last tracking point.
	 * @remarks This takes into consideration that the list is already sorted by date.
	 * @param points the list of tracking points.
	 * @returns the total hours that have passed between the first and last tracking point.
	 */
	private getTotalDurationHours(points: TrackingPoint[]): number {
		const start = new Date(points[0].date);
		const end = new Date(points[points.length - 1].date);
		const ms = end.getTime() - start.getTime();
		return ms / 1000 / 60 / 60;
	}

	/**
	 * Get the total distance from a list of tracking points (km).
	 * @param points the list of tracking points.
	 * @returns The total distance from a list of tracking points (km).
	 */
	private getTotalDistanceKm(points: TrackingPoint[]): number {
		let totalDistance = 0;
		for (let index = 0; index < points.length; index++) {
			const point1 = points[index];
			const point2 = points[index + 1];
			if (!point2) {
				break;
			}

			// Would have used the distanceTo function https://docs.mapbox.com/mapbox-gl-js/api/geography/#lnglat
			// This function seems to not be available in version 1 of mapbox-gl
			// const lngLat1 = new LngLat(point1.longitude, point1.latitude);
			// const lngLat2 = new LngLat(point2.longitude, point2.latitude);
			// const distance = lngLat1.distanceTo(lngLat2);
			const distance = this.getDistance(point1, point2);

			totalDistance += distance;
		}
		return totalDistance;
	}

	/**
	 * Get the distance between two points (km).
	 * @param point1 first point.
	 * @param point2 second point.
	 * @returns the distance between two points (km).
	 */
	private getDistance(
		point1: { latitude: number; longitude: number },
		point2: { latitude: number; longitude: number }
	): number {
		if (
			point1.latitude === point2.latitude &&
			point1.longitude === point2.longitude
		) {
			return 0;
		} else {
			var radlat1 = (Math.PI * point1.latitude) / 180;
			var radlat2 = (Math.PI * point2.latitude) / 180;
			var theta = point1.longitude - point2.longitude;
			var radtheta = (Math.PI * theta) / 180;
			var distance =
				Math.sin(radlat1) * Math.sin(radlat2) +
				Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
			if (distance > 1) {
				distance = 1;
			}
			distance = Math.acos(distance);
			distance = (distance * 180) / Math.PI;
			distance = distance * 1.609344;

			return distance;
		}
	}

	/**
	 * Get the average speed (km/h).
	 * @param km The amount of km.
	 * @param hours The amount of hours.
	 * @returns The average speed (km/h).
	 */
	private getAverageSpeed(km: number, hours: number): number {
		return km / hours;
	}

	private groupBy<T>(arr: T[], fn: (item: T) => any) {
		return arr.reduce<Record<string, T[]>>((prev, curr) => {
			const groupKey = fn(curr);
			const group = prev[groupKey] || [];
			group.push(curr);
			return { ...prev, [groupKey]: group };
		}, {});
	}

	// This doesn't work. But the idea is to get a list of every intersection for each vessel and filter those that
	// doesn't occur within one hour of each other.
	// The end list would be shown in the warning-panel with the name of the two vessel and the approximate time.
	//
	// private getIntersections(
	// 	currentPoints: TrackingPoint[],
	// 	groupedPoints: [string, TrackingPoint[]][]
	// ): WarningIntersection[] {
	// 	for (let i = 0; i < currentPoints.length; i++) {
	// 		const pA1 = currentPoints[i];
	// 		const pA2 = currentPoints[i + 1];
	// 		if (!pA2) {
	// 			break;
	// 		}

	// 		for (const group of groupedPoints) {
	// 			for (let y = 0; y < group[1].length; y++) {
	// 				const pB1 = group[1][y];
	// 				const pB2 = group[1][y + 1];
	// 				if (!pB2) {
	// 					break;
	// 				}

	// 				const intersection = this.calculateIntersection(
	// 					{
	// 						x:
	// 							Math.cos((pA1.latitude / 180) * Math.PI) *
	// 							Math.sin((pA1.longitude / 180) * Math.PI),
	// 						y:
	// 							Math.cos((pA1.latitude / 180) * Math.PI) *
	// 							Math.cos((pA1.longitude / 180) * Math.PI),
	// 					},
	// 					{
	// 						x:
	// 							Math.cos((pA2.latitude / 180) * Math.PI) *
	// 							Math.sin((pA2.longitude / 180) * Math.PI),
	// 						y:
	// 							Math.cos((pA2.latitude / 180) * Math.PI) *
	// 							Math.cos((pA2.longitude / 180) * Math.PI),
	// 					},
	// 					{
	// 						x:
	// 							Math.cos((pB1.latitude / 180) * Math.PI) *
	// 							Math.sin((pB1.longitude / 180) * Math.PI),
	// 						y:
	// 							Math.cos((pB1.latitude / 180) * Math.PI) *
	// 							Math.cos((pB1.longitude / 180) * Math.PI),
	// 					},
	// 					{
	// 						x:
	// 							Math.cos((pB2.latitude / 180) * Math.PI) *
	// 							Math.sin((pB2.longitude / 180) * Math.PI),
	// 						y:
	// 							Math.cos((pB2.latitude / 180) * Math.PI) *
	// 							Math.cos((pB2.longitude / 180) * Math.PI),
	// 					}
	// 				);

	// 				// if (!intersection) {
	// 				console.log(intersection);
	// 				// }
	// 			}
	// 		}
	// 	}

	// 	return [];
	// }

	// private calculateIntersection(
	// 	p1: { x: number; y: number },
	// 	p2: { x: number; y: number },
	// 	p3: { x: number; y: number },
	// 	p4: { x: number; y: number }
	// ): { x: number; y: number } | undefined {
	// 	const c2x = p3.x - p4.x; // (x3 - x4)
	// 	const c3x = p1.x - p2.x; // (x1 - x2)
	// 	const c2y = p3.y - p4.y; // (y3 - y4)
	// 	const c3y = p1.y - p2.y; // (y1 - y2)

	// 	// down part of intersection point formula
	// 	const d = c3x * c2y - c3y * c2x;

	// 	if (d == 0) {
	// 		return undefined;
	// 	}

	// 	// upper part of intersection point formula
	// 	const u1 = p1.x * p2.y - p1.y * p2.x; // (x1 * y2 - y1 * x2)
	// 	const u4 = p3.x * p4.y - p3.y * p4.x; // (x3 * y4 - y3 * x4)

	// 	// intersection point formula

	// 	const px = (u1 * c2x - c3x * u4) / d;
	// 	const py = (u1 * c2y - c3y * u4) / d;

	// 	return { x: px, y: py };
	// }
}
