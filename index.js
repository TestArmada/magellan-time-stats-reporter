/* eslint no-extra-parens: 0 */
"use strict";

var Q = require("q");
var prettyMs = require("pretty-ms");
var _ = require("lodash");
var clc = require("cli-color");

var timeline = [];

var hasMarker = function (ev, markerName) {
  return ev.markers.find(function (marker) {
    return marker.name === markerName;
  });
};

var firstMarker = function (ev) {
  return ev.markers[0];
};

var lastMarker = function (ev) {
  return ev.markers[ev.markers.length - 1];
};

var diffMarkerTimes = function (startMarker, endMarker) {
  if (startMarker && endMarker) {
    return endMarker.t - startMarker.t;
  } else {
    return 0;
  }
};

var diffMarkers = function (ev, startName, endName, alternateEndName) {
  startName = startName ? startName : "start";
  endName = endName ? endName : "end";

  var startMarker = ev.markers.find(function (marker) {
    return marker.name === startName;
  });
  var endMarker = ev.markers.find(function (marker) {
    return (alternateEndName && marker.name === alternateEndName) || marker.name === endName;
  });
  return diffMarkerTimes(startMarker, endMarker);
};

function Reporter(opts) {
  this.options = {
    console: console
  };
  /* istanbul ignore else */
  if (opts && opts.console) {
    this.options.console = opts.console;
  }
}

Reporter.prototype.initialize = function (magellanGlobals) {
  var analytics = magellanGlobals.analytics;
  var self = this;
  var deferred = Q.defer();
  deferred.resolve();

  analytics.sync().forEach(function (message) {
    self._handleGlobalMessage(message);
  });

  // listen to global emitter
  analytics.getEmitter().addListener("message", this._handleGlobalMessage.bind(this));

  return deferred.promise;
};

// listen to a testRun's events on event emitter source.
Reporter.prototype.listenTo = function (testRun, test, source) {
  if (test && testRun) {
    // Every time a message is received regarding this test, we also get the test object
    // itself so that we're able to reason about retries, worker index, etc.
    source.addListener("message", this._handleTestRunMessage.bind(this, testRun, test));
  } else {
    source.addListener("message", this._handleGlobalMessage.bind(this));
  }
};

//
// Timeline marker: A timeline marker pertaining to a previously-received analytics event.
// Data structure for a timeline marker
// {
//   name: string marker name (eg: "failed", "passed", "end")
//   t: number timestamp
// }
//

// handle a message from a test
Reporter.prototype._handleTestRunMessage = function (testRun, test, message) {
  if (message && message.type && message.data) {
    if (message.type === "analytics-event") {
      timeline.push(message.data);
    } else if (message.type === "analytics-event-mark" && message.data) {
      // Find a previously-received event in our timeline and amend it with this marker.
      for (var i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].name === message.eventName) {
          timeline[i].markers.push(message.data);
          break;
        }
      }
    }
  }
};

// handle a message from a global source
Reporter.prototype._handleGlobalMessage = function (message) {
  if (message && message.type && message.data) {
    if (message.type === "analytics-event") {
      timeline.push(message.data);
    } else if (message.type === "analytics-event-mark" && message.data) {
      // Find a previously-received event in our timeline and amend it with this marker.
      for (var i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].name === message.eventName) {
          timeline[i].markers.push(message.data);
          break;
        }
      }
    }
  }
};

Reporter.prototype.flush = function () {
  var numFailedTests = 0;
  var numPassedTests = 0;
  var numRetries = 0;

  var magellanRun = _.find(timeline, function (item) {
    return item.name === "magellan-run";
  });
  var magellanTime = diffMarkers(magellanRun, "start", "passed", "failed");

  var testRuns = _.filter(timeline, function (item) {
    return _.startsWith(item.name, "test-run-");
  });

  var notTestRuns = _.filter(timeline, function (item) {
    return !_.startsWith(item.name, "test-run-");
  });

  var timeSpentPassing = _.reduce(testRuns, function (result, testRun) {
    var startMarker = testRun.markers.find(function (marker) {
      return marker.name === "start";
    });
    var endMarker = testRun.markers.find(function (marker) {
      return marker.name === "passed";
    });

    if (startMarker && endMarker) {
      numPassedTests++;
      return result + endMarker.t - startMarker.t;
    } else {
      return result;
    }
  }, 0);

  var timeSpentRetrying = _.reduce(testRuns, function (result, testRun) {
    var startMarker = testRun.markers.find(function (marker) {
      return marker.name === "start";
    });
    var endMarker = testRun.markers.find(function (marker) {
      return marker.name === "passed" || marker.name === "failed";
    });

    if (startMarker && endMarker && testRun.metadata.attemptNumber > 1) {
      numRetries++;
      return result + endMarker.t - startMarker.t;
    } else {
      return result;
    }
  }, 0);

  var timeSpentFailing = _.reduce(testRuns, function (result, testRun) {
    var startMarker = testRun.markers.find(function (marker) {
      return marker.name === "start";
    });
    var endMarker = testRun.markers.find(function (marker) {
      return marker.name === "failed";
    });

    if (startMarker && endMarker) {
      numFailedTests++;
      return result + endMarker.t - startMarker.t;
    } else {
      return result;
    }
  }, 0);

  var slowestFailingTest = _.chain(testRuns)
    .filter(function (testRun) {
      return hasMarker(testRun, "failed");
    })
    .maxBy(function (testRun) {
      return diffMarkers(testRun, "start", "failed");
    })
    .value();

  var slowestPassingTest = _.chain(testRuns)
    .filter(function (testRun) {
      return hasMarker(testRun, "passed");
    })
    .maxBy(testRuns, function (testRun) {
      return diffMarkers(testRun, "start", "passed");
    })
    .value();

  this.options.console.log(clc.greenBright("\n============= Runtime Stats ==============\n"));
  this.options.console.log("");
  this.options.console.log("                 # Test runs: " + testRuns.length);
  this.options.console.log("          # Passed test runs: " + numPassedTests);
  this.options.console.log("          # Failed test runs: " + numFailedTests);
  this.options.console.log("           # Re-attempt runs: " + numRetries);
  this.options.console.log("");
  this.options.console.log("                  Human time: " +
    prettyMs(timeSpentFailing + timeSpentPassing));
  this.options.console.log("               Magellan time: " + prettyMs(magellanTime));
  if (magellanTime > 0) {
    this.options.console.log("Human-to-Magellan multiplier: " +
    ((timeSpentFailing + timeSpentPassing) / magellanTime).toFixed(2) + "X");
  } else {
    this.options.console.log("Human-to-Magellan multiplier: N/A");
  }

  this.options.console.log("    Human time spent passing: " + prettyMs(timeSpentPassing));
  this.options.console.log("    Human time spent failing: " + prettyMs(timeSpentFailing));
  this.options.console.log("");

  if (numRetries > 0 && magellanTime > 0) {
    this.options.console.log("         Human time retrying: " + prettyMs(timeSpentRetrying));
    this.options.console.log("Retrying as % of total human: " +
      (timeSpentRetrying / (timeSpentFailing + timeSpentPassing)).toFixed(1) + "%");
  }

  /* istanbul ignore else */
  if (testRuns.length > 0) {
    this.options.console.log("       Average test run time: " +
      prettyMs((timeSpentFailing + timeSpentPassing) / testRuns.length));
  } else {
    this.options.console.log("       Average test run time: N/A");
  }

  /* istanbul ignore else */
  if (numFailedTests > 0) {
    this.options.console.log("Average failed test run time: " +
      prettyMs(timeSpentFailing / numFailedTests));
  } else {
    this.options.console.log("Average failed test run time: N/A");
  }

  /* istanbul ignore else */
  if (numPassedTests > 0) {
    this.options.console.log("Average passed test run time: " +
      prettyMs(timeSpentPassing / numPassedTests));
  } else {
    this.options.console.log("Average passed test run time: N/A");
  }

  /* istanbul ignore else */
  if (slowestPassingTest) {
    this.options.console.log("");
    this.options.console.log("Slowest passing test:");
    this.options.console.log("      test: \"" + slowestPassingTest.metadata.test +
      "\" @: " + slowestPassingTest.metadata.browser + " ");
    this.options.console.log(" attempt #: " + slowestPassingTest.metadata.attemptNumber);
  }

  /* istanbul ignore else */
  if (slowestFailingTest) {
    this.options.console.log("");
    this.options.console.log("      test: \"" + slowestFailingTest.metadata.test +
      "\" @: " + slowestFailingTest.metadata.browser + " ");
    this.options.console.log(" attempt #: " + slowestFailingTest.metadata.attemptNumber);
  }

  /* istanbul ignore else */
  if (notTestRuns.length > 0) {
    var metrics = _.filter(notTestRuns, function (metric) {
      return metric.markers && metric.markers.length === 2;
    });

    /* istanbul ignore else */
    if (metrics.length) {
      this.options.console.log("");
      this.options.console.log("Other timing metrics: ");
      var self = this;
      metrics.forEach(function (metric) {
        var start = firstMarker(metric);
        var end = lastMarker(metric);
        var time = diffMarkerTimes(start, end);
        self.options.console.log("    " + metric.name + " (" + start.name + " -> " +
          end.name + ") " + prettyMs(time));
      });
      this.options.console.log("");
    }
  }

  this.options.console.log("");
};

module.exports = Reporter;
module.exports.diffMarkerTimes = diffMarkerTimes;
module.exports.diffMarkers = diffMarkers;
