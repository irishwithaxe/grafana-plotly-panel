import { Trace } from "./Trace";

export class dataTransformator {
    static ident = "dataTransformator"
    static debug = true

    static toTraces(dataList, dataColumnNames) {
        if (this.debug) {
            console.log(this.ident, 'whole datalist', dataList);
        }

        let series = new Map<string, Trace>();
        let sortedSeries: Trace[] = [];
        var allColumnNames = "";

        dataList.forEach(dbRequestResults => {
            if (this.debug) {
                console.log(this.ident, 'datalist item', dbRequestResults);
            }

            if (dbRequestResults.rows && dbRequestResults.rows.length > 0) {
                let traceDataColumn = 2;
                let xValueColumn = 1;
                let yValueColumn = 3;

                dbRequestResults.columns.forEach((row, index) => {
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

                allColumnNames = dbRequestResults.columns.map((r: { text: string; }) => r.text).join(' ')

                let sortedRows = dbRequestResults.rows.sort((obj1: any[], obj2: any[]) => {
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
        });

        console.log(this.ident, 'sorted series', sortedSeries);

        return Object({
            sortedSeries,
            allColumnNames
        })
    }
}