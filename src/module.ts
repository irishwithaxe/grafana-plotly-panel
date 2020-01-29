/* -*- Mode: typescript; indent-tabs-mode: nil; typescript-indent-level: 2 -*- */

///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import { MetricsPanelCtrl } from 'app/plugins/sdk';

import _ from 'lodash';
import $ from 'jquery';

import {
  SeriesWrapper,
  SeriesWrapperSeries,
  SeriesWrapperTable,
  SeriesWrapperTableRow,
} from './SeriesWrapper';
import { EditorHelper } from './editor';

import { loadPlotly, loadIfNecessary } from './libLoader';
import { AnnoInfo } from './anno';
import { Axis } from 'plotly.js';
import { Trace } from './Trace';
import { dataTransformator } from './dataTransformator';
import { defaultValues } from './defaultValues';

let Plotly: any; // Loaded dynamically!

class PlotlyPanelCtrl extends MetricsPanelCtrl {
  static templateUrl = 'partials/module.html';
  static configVersion = 1; // An index to help config migration

  initialized: boolean;
  //$tooltip: any;

  static yaxis2: Partial<Axis> = {
    title: 'Annotations',
    type: 'linear',
    range: [0, 1],
    visible: false,
  };

  defaultPanelConfigs: any = defaultValues.defaultConfig;

  graphDiv: any;
  selectorDiv: any;
  selectorSelect: any;
  dataList: any[] = [];
  annotations = new AnnoInfo();
  series: SeriesWrapper[];
  seriesByKey: Map<string, SeriesWrapper> = new Map();
  seriesHash = '?';

  dataColumns: any[];
  newTraces: any[];

  queriesDescriptions: any;

  traces: any[]; // The data sent directly to Plotly -- with a special __copy element
  layout: any; // The layout used by Plotly

  mouse: any;
  cfg: any;

  // For editor
  editor: EditorHelper;
  dataWarnings: string[]; // warnings about loading data

  /** @ngInject **/
  constructor(
    $scope,
    $injector,
    $window,
    // private $rootScope,
    public uiSegmentSrv,
    private annotationsSrv
  ) {
    super($scope, $injector);

    this.initialized = false;

    // defaults configs
    _.defaultsDeep(this.panel, this.defaultPanelConfigs);

    this.cfg = this.panel.pconfig;

    this.traces = [];
    this.queriesDescriptions = this.defaultPanelConfigs.pconfig.queriesDescription;

    // ?? This seems needed for tests?!!
    if (!this.events) {
      return;
    }

    loadPlotly(this.cfg).then(v => {
      Plotly = v;
      console.log('Plotly', v);

      // Wait till plotly exists has loaded before we handle any data
      this.events.on('render', this.onRender.bind(this));
      this.events.on('data-received', this.onDataReceived.bind(this));
      this.events.on('data-error', this.onDataError.bind(this));
      this.events.on('panel-size-changed', this.onResize.bind(this));
      this.events.on('data-snapshot-load', this.onDataSnapshotLoad.bind(this));
      this.events.on('refresh', this.onRefresh.bind(this));

      // Refresh after plotly is loaded
      this.refresh();
    });

    // Standard handlers
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('panel-initialized', this.onPanelInitialized.bind(this));
  }

  getCssRule(selectorText): CSSStyleRule | null {
    const styleSheets = document.styleSheets;
    for (let idx = 0; idx < styleSheets.length; idx += 1) {
      const styleSheet = styleSheets[idx] as CSSStyleSheet;
      const rules = styleSheet.cssRules;
      for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx += 1) {
        const rule = rules[ruleIdx] as CSSStyleRule;
        if (rule.selectorText === selectorText) {
          return rule;
        }
      }
    }
    return null;
  }

  // Don't call resize too quickly
  doResize = _.debounce(() => {
    // https://github.com/alonho/angular-plotly/issues/26
    const e = window.getComputedStyle(this.graphDiv).display;
    if (!e || 'none' === e) {
      // not drawn!
      console.warn('resize a plot that is not drawn yet');
    } else {
      const rect = this.graphDiv.getBoundingClientRect();
      this.layout.width = rect.width;
      this.layout.height = this.height;
      Plotly.redraw(this.graphDiv);

      console.log('redraw with layout:', this.layout);
    }
  }, 50);

  onResize() {
    console.log('onResize', this.graphDiv, this.layout, Plotly, this.graphDiv && this.layout && Plotly)
    if (this.graphDiv && this.layout && Plotly) {
      this.doResize(); // Debounced
    }
  }

  onDataError(err) {
    this.series = [];
    this.annotations.clear();
    this.render();
  }

  onRefresh() {
    // ignore fetching data if another panel is in fullscreen
    if (this.otherPanelInFullscreenMode()) {
      return;
    }

    if (this.graphDiv && this.initialized && Plotly) {
      Plotly.redraw(this.graphDiv);
    }
  }

  onInitEditMode() {
    this.editor = new EditorHelper(this);
    this.addEditorTab('Display', 'public/plugins/natel-plotly-panel/partials/tab_display.html', 2);
    this.addEditorTab('Traces', 'public/plugins/natel-plotly-panel/partials/tab_traces.html', 3);
    //  this.editorTabIndex = 1;
    this.onConfigChanged(); // Sets up the axis info

    // Check the size in a little bit
    setTimeout(() => {
      console.log('RESIZE in editor');
      this.onResize();
    }, 500);
  }

  processConfigMigration() {
    console.log('Migrating Plotly Configuration to version: ' + PlotlyPanelCtrl.configVersion);

    // Remove some things that should not be saved
    const cfg = this.panel.pconfig;
    delete cfg.layout.plot_bgcolor;
    delete cfg.layout.paper_bgcolor;
    delete cfg.layout.autosize;
    delete cfg.layout.height;
    delete cfg.layout.width;
    delete cfg.layout.margin;
    delete cfg.layout.scene;
    if (!this.is3d()) {
      delete cfg.layout.zaxis;
    }

    // Move from 'markers-lines' to checkbox
    if (cfg.settings.mode) {
      const old = cfg.settings.mode;
      const show = {
        markers: old.indexOf('markers') >= 0,
        lines: old.indexOf('lines') >= 0,
      };
      _.forEach(cfg.traces, trace => {
        trace.show = show;
      });
      delete cfg.settings.mode;
    }

    // TODO... MORE Migrations
    console.log('After Migration:', cfg);
    this.cfg = cfg;
    this.panel.version = PlotlyPanelCtrl.configVersion;
  }

  onPanelInitialized() {
    if (!this.panel.version || PlotlyPanelCtrl.configVersion > this.panel.version) {
      this.processConfigMigration();
    }
    // this._updateTraceData(true);
  }

  deepCopyWithTemplates = obj => {
    if (_.isArray(obj)) {
      return obj.map(val => this.deepCopyWithTemplates(val));
    } else if (_.isString(obj)) {
      return this.templateSrv.replace(obj, this.panel.scopedVars);
    } else if (_.isObject(obj)) {
      const copy = {};
      _.forEach(obj, (v, k) => {
        copy[k] = this.deepCopyWithTemplates(v);
      });
      return copy;
    }
    return obj;
  };

  getProcessedLayout() {
    // Copy from config
    const layout = this.deepCopyWithTemplates(this.cfg.layout);

    layout.plot_bgcolor = 'transparent';
    layout.paper_bgcolor = layout.plot_bgcolor;

    // Update the size
    const rect = this.graphDiv.getBoundingClientRect();
    layout.autosize = false; // height is from the div
    layout.height = this.height;
    layout.width = rect.width;

    // Make sure it is something
    if (!layout.xaxis) {
      layout.xaxis = {};
    }
    if (!layout.yaxis) {
      layout.yaxis = {};
    }

    // Fixed scales
    if (this.cfg.fixScale) {
      if ('x' === this.cfg.fixScale) {
        layout.yaxis.scaleanchor = 'x';
      } else if ('y' === this.cfg.fixScale) {
        layout.xaxis.scaleanchor = 'y';
      } else if ('z' === this.cfg.fixScale) {
        layout.xaxis.scaleanchor = 'z';
        layout.yaxis.scaleanchor = 'z';
      }
    }

    layout.margin = {
      l: layout.yaxis.title ? 50 : 35,
      r: 5,
      t: 0,
      b: layout.xaxis.title ? 65 : 30,
      pad: 2,
    };

    // get the css rule of grafana graph axis text
    const labelStyle = this.getCssRule('div.flot-text');
    if (labelStyle) {
      let color = labelStyle.style.color;
      if (!layout.font) {
        layout.font = {};
      }
      layout.font.color = color;

      // make the grid a little more transparent
      color = $.color
        .parse(color)
        .scale('a', 0.22)
        .toString();

      // set gridcolor (like grafana graph)
      layout.xaxis.gridcolor = color;
      layout.yaxis.gridcolor = color;
    }

    // for scattermapbox: display two plots instead of one
    // one plot is bars and another is scattermapbox
    if (this.cfg.settings.type === 'scattermapbox') {
      layout.mapbox = {
        domain: {
          x: [0, 1],
          y: [0, 0.8]
        },
        center: { lon: -122.4, lat: 37.75 },
        style: "open-street-map",
        zoom: 11
      }
      layout.xaxis.domain = [0, 1]
      layout.yaxis.domain = [0.85, 1]
    }

    // Set the second axis
    // layout.yaxis2 = PlotlyPanelCtrl.yaxis2;
    delete layout.scene;
    delete layout.zaxis;
    delete layout.xaxis.range;
    delete layout.yaxis.range;

    let oldLayout = this.graphDiv.layout
    if (oldLayout && oldLayout.mapbox && oldLayout.mapbox.center) {
      layout.mapbox.center = oldLayout.mapbox.center
      layout.mapbox.zoom = oldLayout.mapbox.zoom
    }
    if (oldLayout && oldLayout.xaxis && oldLayout.yaxis && oldLayout.xaxis.range && oldLayout.yaxis.range) {
      layout.xaxis.range = oldLayout.xaxis.range
      layout.yaxis.range = oldLayout.yaxis.range
    }

    //let oldData = this.graphDiv.data    

    return layout;
  }

  drawPlot() {
    const s = this.cfg.settings;
    const options = {
      showLink: false,
      displaylogo: false,
      scrollZoom: true,
      displayModeBar: s.displayModeBar,
      modeBarButtonsToRemove: ['sendDataToCloud'], //, 'select2d', 'pan2d', 'lasso2d']
    };

    this.layout = this.getProcessedLayout();

    console.log("draw plot with", 'data', this.newTraces, 'layout', this.layout, 'options', options);
    Plotly.react(this.graphDiv, this.newTraces, this.layout, options);
  }

  onPointsSelected(data) {
    if (!data || !data.points || !data.points.length || data.points[0].data.type != 'bar') {
      return;
    }

    var timesHash = {}
    data.points.forEach(p => timesHash[p.x] = true)

    this.displaySelectedQuery(time => time in timesHash)
  }

  onRender() {
    // ignore fetching data if another panel is in fullscreen
    if (this.otherPanelInFullscreenMode() || !this.graphDiv) {
      return;
    }

    if (!Plotly) {
      return;
    }

    if (!this.initialized) {
      this.drawPlot();

      this.graphDiv.on('plotly_click', data => {
        if (data === undefined || data.points === undefined) {
          return;
        }

        this.onPointsSelected(data);
        console.log('on click', data);
      });

      this.graphDiv.on('plotly_selected', data => {
        if (data === undefined || data.points === undefined) {
          return;
        }

        this.onPointsSelected(data);
        console.log('on select', data);
      });

      this.initialized = true;
    } else if (this.initialized) {
      Plotly.redraw(this.graphDiv);
    } else {
      console.log('Not initialized yet!');
    }
  }

  onDataSnapshotLoad(snapshot) {
    this.onDataReceived(snapshot);
  }

  _hadAnno = false;

  displaySelectedQuery(timeFilter) {
    this.newTraces = []

    var dataRowIndex = 0
    var columnNames = this.cfg.dataColumnNames
    if (this.queriesDescriptions.length > 1) {
      dataRowIndex = Number(this.selectorSelect.options[this.selectorSelect.selectedIndex].value)

      if (Number.isNaN(dataRowIndex)) {
        dataRowIndex = 0;
      }

      this.queriesDescriptions.forEach(element => {
        let queryNumber: number = Number(element.queryNumber)
        if (queryNumber == dataRowIndex) {
          columnNames = element.dataColumnNames
        }
      });
    }

    let dataRow = this.dataList[dataRowIndex]

    if (!dataRow || !columnNames) {
      console.log("no data, nothing to display")
      return;
    }

    let graphType = this.cfg.settings.type;
    if (graphType === 'scatter' || graphType === 'bar' || graphType === 'histogram') {
      let { sortedSeries, allColumnNames } = dataTransformator.toTraces(dataRow, columnNames)

      this.cfg.dataColumnNames.all = allColumnNames

      sortedSeries.forEach((serie: Trace) => {
        let xVals = serie.x.map(String)
        let yVals = serie.y

        this.newTraces.push({
          x: xVals,
          y: yVals,
          type: this.cfg.settings.type,
          mode: this.cfg.settings.mode,
          fill: this.cfg.settings.fill,
          // text: hover text
          // https://plot.ly/~alex/455/four-ways-to-change-opacity-of-scatter-markers.embed
          // fillcolor: 'rgba(26, 150, 65, 0.4)',
          name: serie.name
        })
      })
    } else if (graphType === 'scattermapbox') {
      let { lat, lon, data, X, Yselected, Yhidden, allColumnNames } = dataTransformator.toLatLonDataObject(dataRow, columnNames, timeFilter)

      this.cfg.dataColumnNames.all = allColumnNames

      this.newTraces.push({
        x: X,
        y: Yselected,
        type: 'bar',
        name: 'selected'
      })

      this.newTraces.push({
        x: X,
        y: Yhidden,
        type: 'bar',
        name: 'hidden'
      })

      let normalizedData = dataTransformator.normalize(data, 20, 50)
      this.newTraces.push({
        type: 'scattermapbox',
        lon: lon,
        lat: lat,
        marker: { size: normalizedData, color: 'rgba(0, 0, 255, 0.6)' },
        text: data,
        name: ''
      })
    } else {
      console.log("UNEXPECTED GRAPH TYPE: " + graphType);
    }

    // this.onConfigChanged();
    // this.render();

    this.drawPlot();
  }

  onDataReceived(dataList) {
    if (!dataList || dataList.length < 1) {
      console.log('data is empty:', dataList);
      return;
    }

    this.dataList = dataList;

    this.displaySelectedQuery((_xVal) => true);

    // return;

    const finfo: SeriesWrapper[] = [];
    let seriesHash = '/';
    if (dataList && dataList.length > 0) {
      const useRefID = dataList.length === this.panel.targets.length;
      dataList.forEach((series, sidx) => {

        let refId = '';
        if (useRefID) {
          refId = _.get(this.panel, 'targets[' + sidx + '].refId');
          if (!refId) {
            refId = String.fromCharCode('A'.charCodeAt(0) + sidx);
          }
        }
        if (series.columns) {
          for (let i = 0; i < series.columns.length; i++) {
            finfo.push(new SeriesWrapperTable(refId, series, i));
          }
          finfo.push(new SeriesWrapperTableRow(refId, series));
        } else if (series.target) {
          finfo.push(new SeriesWrapperSeries(refId, series, 'value'));
          finfo.push(new SeriesWrapperSeries(refId, series, 'time'));
          finfo.push(new SeriesWrapperSeries(refId, series, 'index'));
        } else {
          console.error('Unsupported Series response', sidx, series);
        }
      });
    }
    this.seriesByKey.clear();
    finfo.forEach(s => {
      s.getAllKeys().forEach(k => {
        this.seriesByKey.set(k, s);
        seriesHash += '$' + k;
      });
    });
    this.series = finfo;

    // Now Process the loaded data
    const hchanged = this.seriesHash !== seriesHash;
    if (hchanged && this.editor) {
      EditorHelper.updateMappings(this);
      this.editor.selectTrace(this.editor.traceIndex);
      this.editor.onConfigChanged();
    }

    if (hchanged || !this.initialized) {
      this.onConfigChanged();
      this.seriesHash = seriesHash;
    }

    // Support Annotations
    let annotationPromise = Promise.resolve();
    if (!this.cfg.showAnnotations || this.is3d()) {
      this.annotations.clear();
      if (this.layout) {
        if (this.layout.shapes) {
          this.onConfigChanged();
        }
        this.layout.shapes = [];
      }
    } else {
      annotationPromise = this.annotationsSrv
        .getAnnotations({
          dashboard: this.dashboard,
          panel: this.panel,
          range: this.range,
        })
        .then(results => {
          const hasAnno = this.annotations.update(results);
          if (this.layout) {
            if (hasAnno !== this._hadAnno) {
              this.onConfigChanged();
            }
            this.layout.shapes = this.annotations.shapes;
          }
          this._hadAnno = hasAnno;
        });
    }

    // Load the real data changes
    annotationPromise.then(() => {
      // this._updateTraceData();
      this.render();
    });
  }

  /*

  __addCopyPath(trace: any, key: string, path: string) {
    if (key) {
      trace.__set.push({
        key: key,
        path: path,
      });
      const s: SeriesWrapper = this.seriesByKey.get(key);
      if (!s) {
        this.dataWarnings.push('Unable to find: ' + key + ' for ' + trace.name + ' // ' + path);
      }
    }
  }

    // This will update all trace settings *except* the data
    _updateTracesFromConfigs() {
      this.dataWarnings = [];
  
      // Make sure we have a trace
      if (this.cfg.traces == null || this.cfg.traces.length < 1) {
        this.cfg.traces = [_.cloneDeep(defaultValues.defaultTrace)];
      }
  
      const is3D = this.is3d();
      this.traces = this.cfg.traces.map((tconfig, idx) => {
        const config = this.deepCopyWithTemplates(tconfig) || {};
        _.defaults(config, defaultValues.defaultConfig);
        const mapping = config.mapping;
  
        const trace: any = {
          name: config.name || EditorHelper.createTraceName(idx),
          type: this.cfg.settings.type,
          // mode: 'markers+lines', // really depends on config settings
          __set: [], // { key:? property:? }
        };
  
        let mode = '';
        if (config.show.markers) {
          mode += '+markers';
          trace.marker = config.settings.marker;
  
          delete trace.marker.sizemin;
          delete trace.marker.sizemode;
          delete trace.marker.sizeref;
  
          if (config.settings.color_option === 'ramp') {
            this.__addCopyPath(trace, mapping.color, 'marker.color');
          } else {
            delete trace.marker.colorscale;
            delete trace.marker.showscale;
          }
        }
  
        if (config.show.lines) {
          mode += '+lines';
          trace.line = config.settings.line;
        }
  
        // Set the text
        this.__addCopyPath(trace, mapping.text, 'text');
        this.__addCopyPath(trace, mapping.x, 'x');
        this.__addCopyPath(trace, mapping.y, 'y');
  
        if (is3D) {
          this.__addCopyPath(trace, mapping.z, 'z');
        }
  
        // Set the trace mode
        if (mode) {
          trace.mode = mode.substring(1);
        }
        return trace;
      });
    }
  
    // Fills in the required data into the trace values
    _updateTraceData(force = false): boolean {
      if (!this.series) {
        // console.log('NO Series data yet!');
        return false;
      }
  
      if (force || !this.traces) {
        this._updateTracesFromConfigs();
      } else if (this.traces.length !== this.cfg.traces.length) {
        console.log(
          'trace number mismatch.  Found: ' +
          this.traces.length +
          ', expect: ' +
          this.cfg.traces.length
        );
        this._updateTracesFromConfigs();
      }
  
      // Use zero when the metric value is missing
      // Plotly gets lots of errors when the values are missing
      let zero: any = [];
      this.traces.forEach(trace => {
        if (trace.__set) {
          trace.__set.forEach(v => {
            const s = this.seriesByKey.get(v.key);
            let vals: any[] = zero;
            if (s) {
              vals = s.toArray();
              if (vals && vals.length > zero.length) {
                zero = Array.from(Array(3), () => 0);
              }
            } else {
              if (!this.error) {
                this.error = '';
              }
              this.error += 'Unable to find: ' + v.key + ' (using zeros).  ';
            }
            if (!vals) {
              vals = zero;
            }
            _.set(trace, v.path, vals);
          });
        }
      });
  
      return true;
    }
  */

  fillAndSwitchSelector() {
    if (this.queriesDescriptions.length > 1) {
      this.selectorDiv.style.visibility = "visible";
      this.selectorSelect.innerHTML = "";
      this.queriesDescriptions.forEach((queryConf: any) => {
        let option = document.createElement("option");
        option.text = queryConf.queryTitle;
        option.value = queryConf.queryNumber;

        this.selectorSelect.add(option)
      })

      console.log('updating switch with values from: ', this.queriesDescriptions)
    } else {
      this.selectorDiv.style.visibility = "hidden"
    }
  }

  onConfigChanged() {
    // Force reloading the traces
    // this._updateTraceData(true);

    if (!Plotly) {
      return;
    }

    this.fillAndSwitchSelector();

    // Check if the plotly library changed
    loadIfNecessary(this.cfg).then(res => {
      if (res) {
        if (Plotly) {
          Plotly.purge(this.graphDiv);
        }
        Plotly = res;
      }

      // Updates the layout and redraw
      if (this.initialized && this.graphDiv) {
        if (!this.cfg.showAnnotations) {
          this.annotations.clear();
        }

        this.drawPlot();
      }

      this.render(); // does not query again!
    });
  }

  is3d() {
    return this.cfg.settings.type === 'scatter3d';
  }

  link(scope, elem, attrs, ctrl) {
    this.graphDiv = elem.find('.plotly-spot')[0];

    this.selectorDiv = elem.find('.query-selector-div')[0];
    this.selectorSelect = elem.find('.query-selector')[0];
    let panel = this;
    this.selectorSelect.addEventListener("change", function () { panel.displaySelectedQuery((_xVal) => true) });
    this.initialized = false;
    elem.on('mousemove', evt => {
      this.mouse = evt;
    });

    this.fillAndSwitchSelector();
  }
}

export { PlotlyPanelCtrl, PlotlyPanelCtrl as PanelCtrl };
