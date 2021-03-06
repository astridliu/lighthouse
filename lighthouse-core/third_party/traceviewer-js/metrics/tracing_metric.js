/**
Copyright 2016 The Chromium Authors. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
**/

require("./metric_registry.js");
require("../value/numeric.js");
require("../value/value.js");

'use strict';

global.tr.exportTo('tr.metrics', function() {

  function tracingMetric(valueList, model) {
    if (!model.stats.hasEventSizesinBytes) {
      throw new Error('Model stats does not have event size information. ' +
                      'Please enable ImportOptions.trackDetailedModelStats.');
    }

    var eventStats = model.stats.allTraceEventStatsInTimeIntervals;
    eventStats.sort(function(a, b) {
      return a.timeInterval - b.timeInterval;
    });

    var totalTraceBytes = eventStats.reduce((a, b) =>
                                            (a + b.totalEventSizeinBytes), 0);

    // We maintain a sliding window of records [start ... end-1] where end
    // increments each time through the loop, and we move start just far enough
    // to keep the window less than 1 second wide. Note that we need to compute
    // the number of time intervals (i.e. units that timeInterval is given in)
    // in one second to know how wide the sliding window should be.
    var maxEventCountPerSec = 0;
    var maxEventBytesPerSec = 0;
    var INTERVALS_PER_SEC = Math.floor(
        1000 / model.stats.TIME_INTERVAL_SIZE_IN_MS);

    var runningEventNumPerSec = 0;
    var runningEventBytesPerSec = 0;
    var start = 0;
    var end = 0;

    while (end < eventStats.length) {
      // Slide the end marker forward. Moving the end marker from N
      // to N+1 adds eventStats[N] to the sliding window.
      runningEventNumPerSec += eventStats[end].numEvents;
      runningEventBytesPerSec += eventStats[end].totalEventSizeinBytes;
      end++;

      // Slide the start marker forward so that the time interval covered
      // by the window is less than 1 second wide.
      while ((eventStats[end - 1].timeInterval -
              eventStats[start].timeInterval) >= INTERVALS_PER_SEC) {
        runningEventNumPerSec -= eventStats[start].numEvents;
        runningEventBytesPerSec -= eventStats[start].totalEventSizeinBytes;
        start++;
      }

      // Update maximum values.
      maxEventCountPerSec = Math.max(maxEventCountPerSec,
                                     runningEventNumPerSec);
      maxEventBytesPerSec = Math.max(maxEventBytesPerSec,
                                     runningEventBytesPerSec);

    }

    var stats = model.stats.allTraceEventStats;
    var categoryNamesToTotalEventSizes = (
        stats.reduce((map, stat) => (
            map.set(stat.category,
                   ((map.get(stat.category) || 0) +
                    stat.totalEventSizeinBytes))), new Map()));

    // Determine the category with the highest total event size.
    var maxCatNameAndBytes = Array.from(
        categoryNamesToTotalEventSizes.entries()).reduce(
            (a, b) => (b[1] >= a[1]) ? b : a);
    var maxEventBytesPerCategory = maxCatNameAndBytes[1];
    var categoryWithMaxEventBytes = maxCatNameAndBytes[0];

    var maxEventCountPerSecValue = new tr.v.ScalarNumeric(
        tr.v.Unit.byName.unitlessNumber_smallerIsBetter, maxEventCountPerSec);
    var maxEventBytesPerSecValue = new tr.v.ScalarNumeric(
        tr.v.Unit.byName.sizeInBytes_smallerIsBetter, maxEventBytesPerSec);
    var totalTraceBytesValue = new tr.v.ScalarNumeric(
        tr.v.Unit.byName.sizeInBytes_smallerIsBetter, totalTraceBytes);

    var diagnostics = {
      category_with_max_event_size: {
        name: categoryWithMaxEventBytes,
        size_in_bytes: maxEventBytesPerCategory
      }
    };

    valueList.addValue(new tr.v.NumericValue(
        model.canonicalUrl,
        'Total trace size in bytes',
        totalTraceBytesValue,
        undefined, undefined, diagnostics));
    valueList.addValue(new tr.v.NumericValue(
        model.canonicalUrl,
        'Max number of events per second',
        maxEventCountPerSecValue,
        undefined, undefined, diagnostics));
    valueList.addValue(new tr.v.NumericValue(
        model.canonicalUrl,
        'Max event size in bytes per second',
        maxEventBytesPerSecValue,
        undefined, undefined, diagnostics));
  }

  tracingMetric.prototype = {
    __proto__: Function.prototype
  };

  tr.metrics.MetricRegistry.register(tracingMetric);

  return {
    tracingMetric: tracingMetric
  };

});
