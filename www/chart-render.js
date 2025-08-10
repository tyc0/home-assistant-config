function renderChart() {
  setTimeout(() => {
    var chartDiv = document.querySelector("#customChart");

    if (!chartDiv) {
      console.log("Chart div not found");
      return;
    }

    console.log("Rendering chart...");

    var options = {
      series: [{
        data: [10, 20, 15, 30, 35, 30, 45, 59, 30, 35, 25, 29, 15]
      }],
      chart: {
        type: 'area',
        height: 350,
        background: '#19191E',
        dropShadow: {
          enabled: true,
          color: '#000'
        },
        zoom: { enabled: false }
      },
      dataLabels: { enabled: false },
      markers: { colors: ['#FFFFFF'] },
      stroke: {
        curve: 'smooth',
        width: 3,
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          type: 'vertical',
          colorStops: [
            { offset: 0, color: '#F48116', opacity: 1 },
            { offset: 70, color: '#6510F8', opacity: 0.2 },
            { offset: 97, color: '#6510F8', opacity: 0.0 }
          ]
        }
      },
      xaxis: {
        labels: { style: { colors: '#aaa' } }
      },
      yaxis: { labels: { show: false } },
      grid: { borderColor: '#222226' },
      theme: { mode: 'dark' }
    };

    var chart = new ApexCharts(chartDiv, options);
    chart.render();
  }, 500);
}
