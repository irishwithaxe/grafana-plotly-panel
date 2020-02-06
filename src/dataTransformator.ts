import { Trace } from "./Trace";

export class dataTransformator {
    static ident = "dataTransformator"
    static debug = false

    static normalize(data: number[], newMin: number, newMax: number): number[] {
        if (!data || data.length < 1 || newMax < newMin) {
            return data;
        }

        var min = data[0];
        var max = data[0];
        data.forEach(value => {
            if (max < value) {
                max = value;
            }
            if (min > value) {
                min = value;
            }
        })

        let delta = max - min;
        let newDelta = newMax - newMin;

        if (delta != 0) {
            return data.map(value => {
                if (value == 0) {
                    return 0
                } else {
                    return ((value - min) / delta) * newDelta + newMin
                }
            })
        }
        else {
            return data.map(value => {
                if (value == 0) {
                    return 0
                } else {
                    return newMin
                }
            })
        }
    }

    static toLatLonTraces(dataSet, dataColumnNames, xValueFilter) {
        if (this.debug) {
            console.log(this.ident, 'whole dataSet', dataSet);
            console.log(this.ident, 'data columns', dataColumnNames);
        }

        class GeoPoint {
            public lat: number = 0
            public lon: number = 0
            public data: number = 0
            public key: string = ""

            constructor(lat: number, lon: number, data: number) {
                this.lat = lat;
                this.lon = lon;
                this.data = data;
                this.key = this.MapKey(lat, lon)
            }

            public MapKey(lat: number, lon: number): string {
                return lat.toString() + ":" + lon.toString()
            }
        }

        var graphPoints: Map<number, number> = new Map<number, number>();
        var mapPoints: Map<string, GeoPoint> = new Map<string, GeoPoint>();
        var allColumnNames = "";

        if (dataSet.rows && dataSet.rows.length > 0) {
            allColumnNames = dataSet.columns.map((r: { text: string; }) => r.text).join(' ')

            let dataColumn = 0;
            let xColumn = 0;
            let latColumn = 0;
            let lonColumn = 0;

            dataSet.columns.forEach((row, index) => {
                if (row.text == dataColumnNames.xColumn) {
                    xColumn = index
                }
                if (row.text == dataColumnNames.latColumn) {
                    latColumn = index
                }
                if (row.text == dataColumnNames.lonColumn) {
                    lonColumn = index
                }
                if (row.text == dataColumnNames.dataColumn) {
                    dataColumn = index
                }
            })

            if (this.debug) {
                console.log(this.ident, 'column names', dataColumnNames)
                console.log(this.ident, 'columns: data', dataColumn, 'x', xColumn, 'lat', latColumn, 'lon', lonColumn)
            }

            dataSet.rows.forEach(dbRequestRow => {
                let dataRaw = dbRequestRow[dataColumn];
                let dataVal: number = Number(dbRequestRow[dataColumn]);
                let xRaw = dbRequestRow[xColumn];
                let xVal: number = Number(dbRequestRow[xColumn]);
                let lonRaw = dbRequestRow[lonColumn];
                let latRaw = dbRequestRow[latColumn];

                if (xRaw && dataRaw) {
                    let point = graphPoints.get(xVal)
                    if (!point) {
                        graphPoints.set(xVal, dataVal)
                    } else {
                        graphPoints.set(xVal, dataVal + point)
                    }
                }

                if (lonRaw && latRaw && dataRaw && xRaw && xValueFilter(xRaw)) {
                    let lon: number = Number(lonRaw)
                    let lat: number = Number(latRaw)

                    let point = new GeoPoint(lat, lon, dataVal);
                    var exist = mapPoints.get(point.key);
                    if (!exist) {
                        exist = point
                    } else {
                        exist.data = exist.data + point.data;
                    }

                    mapPoints.set(exist.key, exist);
                }
            });
        }

        let len = mapPoints.size

        let lat: number[] = new Array<number>(len);
        let lon: number[] = new Array<number>(len);
        let data: number[] = new Array<number>(len);

        var index = 0
        mapPoints.forEach(point => {
            lat[index] = point.lat;
            lon[index] = point.lon;
            data[index] = point.data;

            index++;
        })

        if (this.debug) {
            console.log(this.ident, 'map points', mapPoints, 'data', data);
            console.log(this.ident, 'graph points', graphPoints);
        }

        var maxHour: number = 24;
        graphPoints.forEach((_pointVal, pointKey) => {
            if (maxHour < pointKey) {
                maxHour = pointKey
            }
        });

        len = maxHour + 1
        let X: number[] = new Array<number>(len).map(() => 0)
        let Y: number[] = new Array<number>(len).map(() => 0)
        let opacity: number[] = new Array<number>(len).map(() => 0)
        for (var i = 0; i < len; i++) {
            X[i] = i
            Y[i] = 0
            opacity[i] = 1
        }

        graphPoints.forEach((pointVal, pointKey) => {
            if (!xValueFilter(pointKey)) {
                opacity[pointKey] = 0.4
            }6
            Y[pointKey] = pointVal
        })

        let Ynormalized = dataTransformator.normalize(Y, 20, 50)
        let barTrace = {
            x: X,
            y: Ynormalized,
            type: 'bar',
            marker: { opacity: opacity },
            text: Y,
        }

        let normalizedData = dataTransformator.normalize(data, 20, 50)
        let mapTrace = {
            type: 'scattermapbox',
            lon: lon,
            lat: lat,
            opacity: 0.6,
            marker: { size: normalizedData },
            text: data,
        }

        return Object({
            mapTrace,
            barTrace,
            allColumnNames
        })
    }

    static toTraces(dataSet, dataColumnNames) {
        if (this.debug) {
            console.log(this.ident, 'whole dataSet', dataSet);
            console.log(this.ident, 'data columns', dataColumnNames);
        }

        let series = new Map<string, Trace>();
        let sortedSeries: Trace[] = [];
        var allColumnNames = "";

        if (dataSet.rows && dataSet.rows.length > 0) {
            allColumnNames = dataSet.columns.map((r: { text: string; }) => r.text).join(' ')

            let traceDataColumn = 2;
            let xValueColumn = 1;
            let yValueColumn = 3;

            dataSet.columns.forEach((row, index) => {
                if (row.text == dataColumnNames.xColumn) {
                    xValueColumn = index
                }
                if (row.text == dataColumnNames.yColumn) {
                    yValueColumn = index
                }
                if (row.text == dataColumnNames.dataColumn) {
                    traceDataColumn = index
                }
            })

            let sortedRows = dataSet.rows.sort((obj1: any[], obj2: any[]) => {
                let obj1order: number = Number(obj1[xValueColumn])
                let obj2order: number = Number(obj2[xValueColumn])

                if (obj1order > obj2order) {
                    return 1;
                }

                if (obj1order < obj2order) {
                    return -1;
                }

                return 0;
            });

            sortedRows.forEach(dbRequestRow => {
                let traceName = dbRequestRow[traceDataColumn];
                let traceX: number = Number(dbRequestRow[xValueColumn]);
                let traceY: number = Number(dbRequestRow[yValueColumn]);

                if (dataColumnNames.xColumn == 'Time') {
                    let xdate = new Date(dbRequestRow[xValueColumn])
                    traceX = xdate.getHours()
                }

                let trace = series.get(traceName);
                if (!trace) {
                    trace = new Trace();
                    trace.name = traceName;
                    series.set(traceName, trace);
                }

                // to keep order
                let prevTraceX: number = trace.x[trace.x.length - 1];
                if (traceX <= prevTraceX) {
                    traceX = prevTraceX + 1;
                }

                trace.x.push(traceX);
                trace.y.push(traceY);
            })

            sortedSeries = Array.from(series.values()).sort((s1: Trace, s2: Trace) => {
                return s1.name.localeCompare(s2.name, undefined, { numeric: true })
            });
        }

        if (this.debug) {
            console.log(this.ident, 'sorted series', sortedSeries);
        }

        return Object({
            sortedSeries,
            allColumnNames
        })
    }
}