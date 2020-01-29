export class defaultValues {
    public static defaultTrace = {
        mapping: {
            x: null,
            y: null,
            z: null,
            text: null,
            color: null,
            size: null,
        },
        show: {
            line: true,
            markers: true,
        },
        settings: {
            line: {
                color: '#005f81',
                width: 6,
                dash: 'solid',
                shape: 'linear',
            },
            marker: {
                size: 15,
                symbol: 'circle',
                color: '#33B5E5',
                colorscale: 'YlOrRd',
                sizemode: 'diameter',
                sizemin: 3,
                sizeref: 0.2,
                line: {
                    color: '#DDD',
                    width: 0,
                },
                showscale: false,
            },
            color_option: 'ramp',
        },
    };

    public static defaultConfig = {
        pconfig: {
            loadFromCDN: false,
            showAnnotations: true,
            fixScale: '',
            traces: [defaultValues.defaultTrace],
            settings: {
                type: 'bar',
                fill: 'None',
                mode: 'None',
                displayModeBar: true,
            },
            dataColumnNames: {
                dataColumn: '',
                xColumn: '',
                yColumn: ''
            },
            queriesDescription: [
                {
                    dataColumnNames: {
                        dataColumn: "count",
                        xColumn: "simulation-hour",
                        lonColumn: "lon",
                        latColumn: "lat",
                    },
                    queryTitle: "count of events",
                    queryNumber: "1"
                },
                {
                    dataColumnNames: {
                        dataColumn: "averageLoad",
                        xColumn: "simulation-hour",
                        lonColumn: "lon",
                        latColumn: "lat"
                    },
                    queryTitle: "average charging load",
                    queryNumber: "0"
                },
            ],
            layout: {
                showlegend: false,
                legend: {
                    orientation: 'h',
                },
                barmode: 'stack',
                dragmode: 'zoom', // (enumerated: "zoom" | "pan" | "select" | "lasso" | "orbit" | "turntable" )
                hovermode: 'closest',
                font: {
                    family: '"Open Sans", Helvetica, Arial, sans-serif',
                },
                xaxis: {
                    showgrid: true,
                    zeroline: false,
                    type: 'auto',
                    rangemode: 'normal', // (enumerated: "normal" | "tozero" | "nonnegative" )
                },
                yaxis: {
                    showgrid: true,
                    zeroline: false,
                    type: 'linear',
                    rangemode: 'normal', // (enumerated: "normal" | "tozero" | "nonnegative" ),
                },
            },
        },
    };
}