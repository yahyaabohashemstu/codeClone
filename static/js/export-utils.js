/**
 * Export Utilities for Clone Detector
 * This file contains functions for exporting results in different formats
 */

// Show progress bar function
function showProgressBar() {
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";

  // Simulate progress (in a real app, this would be updated based on actual progress)
  let progress = 0;
  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = progress + "%";
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        progressContainer.style.display = "none";
      }, 500);
    }
  }, 200);

  return interval;
}

// Export to PDF function
function exportToPDF() {
  const progressInterval = showProgressBar();

  // Make sure jsPDF is available
  if (typeof jspdf === "undefined") {
    console.error("jsPDF library not loaded");
    clearInterval(progressInterval);
    alert(
      "إضافة jsPDF غير متوفرة. يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة."
    );
    return;
  }

  // Use html2canvas to capture the results
  html2canvas(document.getElementById("results"))
    .then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 30;

      // Add title
      pdf.setFontSize(18);
      pdf.setTextColor(106, 13, 173); // Purple color
      pdf.text("تقرير تحليل تشابه الكود", pdfWidth / 2, 20, {
        align: "center",
      });

      // Add date
      pdf.setFontSize(12);
      pdf.setTextColor(102, 102, 102); // Gray color
      const today = new Date();
      pdf.text(
        `تاريخ التقرير: ${today.toLocaleDateString()}`,
        pdfWidth - 20,
        20,
        { align: "right" }
      );

      // Add image
      pdf.addImage(
        imgData,
        "PNG",
        imgX,
        imgY,
        imgWidth * ratio,
        imgHeight * ratio
      );

      // Add page numbers
      const pageCount = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`الصفحة ${i} من ${pageCount}`, pdfWidth / 2, pdfHeight - 10, {
          align: "center",
        });
      }

      // Save the PDF
      pdf.save("clone-detector-results.pdf");

      clearInterval(progressInterval);
    })
    .catch((error) => {
      console.error("Error generating PDF:", error);
      clearInterval(progressInterval);
      alert("حدث خطأ أثناء إنشاء ملف PDF");
    });
}

// Export to Excel function
function exportToExcel() {
  const progressInterval = showProgressBar();

  // Make sure XLSX is available
  if (typeof XLSX === "undefined") {
    console.error("XLSX library not loaded");
    clearInterval(progressInterval);
    alert(
      "إضافة XLSX غير متوفرة. يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة."
    );
    return;
  }

  try {
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();

    // Create similarity data
    const similarityData = [];
    document.querySelectorAll(".result-item").forEach((item) => {
      const label = item
        .querySelector(".result-label")
        .textContent.replace(":", "");
      let value;

      if (item.querySelector(".circle-text")) {
        value = item.querySelector(".circle-text").textContent;
      } else if (item.querySelector(".toggle-status")) {
        value = item.querySelector(".toggle-status").textContent;
      }

      similarityData.push([label, value]);
    });

    // Create metrics data
    const metricsData = [];
    document.querySelectorAll(".metrics-table tr").forEach((row) => {
      const rowData = [];
      row.querySelectorAll("th, td").forEach((cell) => {
        rowData.push(cell.textContent);
      });
      metricsData.push(rowData);
    });

    // Create code data
    const codeData = [
      ["Code 1", document.getElementById("code1").value],
      ["Code 2", document.getElementById("code2").value],
    ];

    // Add worksheets to workbook
    const similaritySheet = XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ...similarityData,
    ]);
    const metricsSheet = XLSX.utils.aoa_to_sheet(metricsData);
    const codeSheet = XLSX.utils.aoa_to_sheet(codeData);

    // Format columns width
    similaritySheet["!cols"] = [{ wch: 40 }, { wch: 20 }];

    // Add the sheets to the workbook
    XLSX.utils.book_append_sheet(wb, similaritySheet, "Similarity Analysis");
    XLSX.utils.book_append_sheet(wb, metricsSheet, "Code Metrics");
    XLSX.utils.book_append_sheet(wb, codeSheet, "Code Snippets");

    // Create report info sheet
    const reportInfoData = [
      ["تقرير تحليل تشابه الكود"],
      ["تاريخ التقرير", new Date().toLocaleDateString()],
      ["اللغة", document.getElementById("language").value],
    ];
    const infoSheet = XLSX.utils.aoa_to_sheet(reportInfoData);
    XLSX.utils.book_append_sheet(wb, infoSheet, "Report Info");

    // Save workbook
    XLSX.writeFile(wb, "clone-detector-results.xlsx");

    clearInterval(progressInterval);
  } catch (error) {
    console.error("Error generating Excel file:", error);
    clearInterval(progressInterval);
    alert("حدث خطأ أثناء إنشاء ملف Excel");
  }
}

// Export to JSON function
function exportToJSON() {
  const progressInterval = showProgressBar();

  try {
    // Gather data
    const data = {
      reportInfo: {
        title: "تقرير تحليل تشابه الكود",
        date: new Date().toISOString(),
        language: document.getElementById("language").value,
      },
      similarityAnalysis: {},
      codeMetrics: {
        code1: {},
        code2: {},
      },
      codeSnippets: {
        code1: document.getElementById("code1").value,
        code2: document.getElementById("code2").value,
      },
    };

    // Get similarity data
    document.querySelectorAll(".result-item").forEach((item) => {
      const label = item
        .querySelector(".result-label")
        .textContent.replace(":", "");
      let value;

      if (item.querySelector(".circle-text")) {
        value = parseFloat(item.querySelector(".circle-text").textContent);
      } else if (item.querySelector(".toggle-status")) {
        value = item.querySelector(".toggle-status").textContent === "true";
      }

      data.similarityAnalysis[label] = value;
    });

    // Get metrics data
    const metricsRows = document.querySelectorAll(".metrics-table tr");
    for (let i = 1; i < metricsRows.length; i++) {
      // Skip header row
      const cells = metricsRows[i].querySelectorAll("td");
      if (cells.length >= 3) {
        const metricName = cells[0].textContent;
        const code1Value = cells[1].textContent;
        const code2Value = cells[2].textContent;

        data.codeMetrics.code1[metricName] = isNaN(parseFloat(code1Value))
          ? code1Value
          : parseFloat(code1Value);
        data.codeMetrics.code2[metricName] = isNaN(parseFloat(code2Value))
          ? code2Value
          : parseFloat(code2Value);
      }
    }

    // Create and download JSON file
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clone-detector-results.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    clearInterval(progressInterval);
  } catch (error) {
    console.error("Error generating JSON file:", error);
    clearInterval(progressInterval);
    alert("حدث خطأ أثناء إنشاء ملف JSON");
  }
}

// Function to capture and save results as an image
function captureResults() {
  const progressInterval = showProgressBar();

  try {
    const results = document.getElementById("results");
    html2canvas(results)
      .then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = imgData;
        link.download = "clone-detector-results.png";
        link.click();

        clearInterval(progressInterval);
      })
      .catch((error) => {
        console.error("Error capturing results:", error);
        clearInterval(progressInterval);
        alert("حدث خطأ أثناء التقاط صورة للنتائج");
      });
  } catch (error) {
    console.error("Error capturing results:", error);
    clearInterval(progressInterval);
    alert("حدث خطأ أثناء التقاط صورة للنتائج");
  }
}

// Dark mode toggle function
function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);

  // Update icon
  const themeIcon = document.getElementById("theme-toggle").querySelector("i");
  if (newTheme === "dark") {
    themeIcon.classList.replace("fa-moon", "fa-sun");
  } else {
    themeIcon.classList.replace("fa-sun", "fa-moon");
  }
}

// Initialize dark mode based on saved preference
function initDarkMode() {
  const savedTheme =
    localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    const themeIcon = document
      .getElementById("theme-toggle")
      .querySelector("i");
    if (themeIcon) {
      themeIcon.classList.replace("fa-moon", "fa-sun");
    }
  }
}

// Export functions for use in HTML
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;
window.exportToJSON = exportToJSON;
window.captureResults = captureResults;
window.toggleDarkMode = toggleDarkMode;
window.initDarkMode = initDarkMode;
