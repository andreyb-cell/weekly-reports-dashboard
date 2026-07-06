function doGet(e) {
  var sheetId1 = "1jWAuBIG2DvrakZFnBGGQRA9eJJQ8uTJQ7-brEl9ssSQ";
  var sheetId2 = "16GxAsmhQauxtWA3rvagSao5EbOHIhpbNNMASf1AGPcQ";
  var tabName = "Загальний";
  
  try {
    var data1 = getSheetData(sheetId1, tabName);
    var data2 = getSheetData(sheetId2, tabName);
    var data2_rev = getSheetData(sheetId2, "Рекли Ревеню");
    var data2_with = getSheetData(sheetId2, "Рекли Вивід");
    
    var result = {
      status: "success",
      source1: data1,
      source2: data2,
      source2_revenue: data2_rev,
      source2_withdrawal: data2_with
    };
    
    // Повертаємо дані як JSON
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetData(sheetId, tabName) {
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(tabName);
  
  if (!sheet) {
    return [];
  }
  
  // Беремо весь діапазон даних
  var data = sheet.getDataRange().getValues();
  return data;
}
