function generateFinalProducts(systemFolderPath, playerData, keyField) {
  var restOfPlayer = playerData.slice();
  var finalProducts = [];
  var templatesFolderPath = systemFolderPath + "/Templates";
  var templatesFolder = new Folder(templatesFolderPath);
  if (!templatesFolder.exists) return finalProducts;

  var templateFolders = templatesFolder.getFiles(function (file) {
    return file instanceof Folder;
  });

  for (var i = 0; i < templateFolders.length; i++) {
    var templateFolder = templateFolders[i];
    var templateFolderName = templateFolder.name;

    // Check template.json first
    var activeFilePath = templateFolder.fsName + "/template.json";
    var activeFile = new File(activeFilePath);

    // Skip if template.json not found
    if (!activeFile.exists) {
      continue;
    }

    activeFile.open("r");
    var activeContent = activeFile.read();
    activeFile.close();

    var activeParsed;
    try {
      activeParsed = eval("(" + activeContent + ")");
    } catch (e) {
      continue; // Skip if parsing fails
    }

    // Skip if active is not "Yes"
    if (!activeParsed.active || activeParsed.active.toLowerCase() !== "yes") {
      continue;
    }

    var filterFilePath = templateFolder.fsName + "/template_filter_set.json";
    var filterFile = new File(filterFilePath);
    if (!filterFile.exists) continue;

    filterFile.open("r");
    var filterContent = filterFile.read();
    filterFile.close();

    var filterSets;
    try {
      filterSets = eval("(" + filterContent + ")");
    } catch (error) {
      continue;
    }

    var filterSetInSingleObj = {};
    for (var j = 0; j < filterSets.length; j++) {
      var filterSet = filterSets[j];
      filterSetInSingleObj[filterSet.field] = filterSet.value;
    }

    var values = [];
    for (var key in filterSetInSingleObj) {
      if (filterSetInSingleObj.hasOwnProperty(key)) {
        values.push(filterSetInSingleObj[key]);
      }
    }
    var joinedStringValues = values.join("_");

    var templateFileName = templateFolderName;
    var templateFilePath =
      templateFolder.fsName + "/" + templateFileName + ".ai";
    var templateFile = new File(templateFilePath);
    if (!templateFile.exists) continue;
    if (restOfPlayer.length === 0) break;

    var groupedPlayers = {};

    for (var m = 0; m < restOfPlayer.length; m++) {
      var player = restOfPlayer[m];
      var dynamicFieldValue = player[keyField];
      var isMatch = true;
      for (var field in filterSetInSingleObj) {
        if (
          !player.hasOwnProperty(field) ||
          player[field] != filterSetInSingleObj[field]
        ) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        if (!groupedPlayers[dynamicFieldValue]) {
          groupedPlayers[dynamicFieldValue] = [];
        }
        groupedPlayers[dynamicFieldValue].push(player);
      }
    }

    // todo: groupedPlayers structure ? {value: [rows]}
    for (var value in groupedPlayers) {
      finalProducts.push({
        templatePath: templateFilePath,
        templateFileName: templateFileName,
        rows: groupedPlayers[value],
        values: joinedStringValues,
      });

      $.writeln(
        "Added new product for template: " +
          templateFileName +
          " with keyField value: " +
          value
      );
    }
  }

  function cleanString(str) {
    var result = "";
    for (var i = 0; i < str.length; i++) {
      var cha = str.charAt(i);
      if (cha !== "|" && cha !== ";" && cha !== "~") {
        result += cha;
      }
    }
    return result;
  }

  function serializeRows(rows) {
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var serialized = [];
      for (var k in row) {
        if (row.hasOwnProperty(k)) {
          serialized.push(k + ":" + cleanString(String(row[k])));
        }
      }
      result.push(serialized.join("|"));
    }
    return result.join("~~"); // rows separated by '~~'
  }

  var modiedFinalProducts = [];
  for (var i = 0; i < finalProducts.length; i++) {
    var product = finalProducts[i];
    var templatePath = product.templatePath;
    var templateFileName = product.templateFileName;
    var rowsStr = serializeRows(product.rows);
    var values = product.values;

    modiedFinalProducts.push(
      templatePath + ";;" + templateFileName + ";;" + rowsStr + ";;" + values
    );
  }

  return modiedFinalProducts.join("|||");
}

var playerData = [
  {
    Item_ID: "FM01-0484-H37-FP7",
    Color連接: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H37",
    Player_ID: 99,
    Player_First_Name: "Y-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z7B",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "Y",
  },
  {
    Item_ID: "FM01-0484-H37-FP7",
    Color連接: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H37",
    Player_ID: 25,
    Player_First_Name: "Y-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z7",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "Y",
  },
  {
    Item_ID: "FM01-0484-H37-FP7",
    Color連接: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H37",
    Player_ID: 24,
    Player_First_Name: "Z-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z5",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "Y",
  },

  {
    Item_ID: "FM01-0484-H37-FP7",
    Color連接: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H37",
    Player_ID: 1,
    Player_First_Name: "A-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z5",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "Y",
  },
  {
    Item_ID: "FW01-0484-H37-FP7",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FW01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H38",
    Player_ID: 1,
    Player_First_Name: "B-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z5",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "v",
  },
  {
    Item_ID: "FM01-0484-H37-FP6",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H39",
    Player_ID: 2,
    Player_First_Name: "C-2",
    Player_Last_Name: "BERTUZZI",
    Player_Number: 59,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z5",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP6",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "y",
  },
  {
    Item_ID: "FW01-0484-H37-FP6",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FW01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H40",
    Player_ID: 2,
    Player_First_Name: "D-2",
    Player_Last_Name: "BERTUZZI",
    Player_Number: 59,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z5",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP6",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "z",
  },
  {
    Item_ID: "FM01-0484-H37-FP7",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H37",
    Player_ID: 1,
    Player_First_Name: "E-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z6",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "Y",
  },
  {
    Item_ID: "FW01-0484-H37-FP7",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FW01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H38",
    Player_ID: 1,
    Player_First_Name: "F-1",
    Player_Last_Name: "TERAVAINEN",
    Player_Number: 86,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z6",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP7",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "v",
  },
  {
    Item_ID: "FM01-0484-H37-FP6",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FM01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H39",
    Player_ID: 2,
    Player_First_Name: "G-2",
    Player_Last_Name: "BERTUZZI",
    Player_Number: 59,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z6",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP6",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "y",
  },
  {
    Item_ID: "FW01-0484-H37-FP6",
    Colorway_Desc: "Athletic Red 0484",
    League_desc: "NHL",
    Lineup_Style_Code: "FW01",
    Lineup_Org_Code: "H37",
    Team_Org_Code: "H40",
    Player_ID: 2,
    Player_First_Name: "H-2",
    Player_Last_Name: "BERTUZZI",
    Player_Number: 59,
    Style_Color_Code: "0484",
    Style_Season: "PPP",
    Date: 45783,
    Artist: "BF",
    "Graphic Concept Code": "01Z6",
    Graphic_Name: "AUTHENTIC STACK",
    Graphic_Org_Name: "CHICAGO BLACKHAWKS",
    Graphic_No_of_Placements: null,
    Graphic_code: "FP6",
    True_Org_Code: null,
    Colorway_1_Desc: null,
    Colorway_2_Desc: null,
    Colorway_3_Desc: "z",
  },
];
generateFinalProducts(
  "/Users/ashik/Documents/MDS/Resource/LEAP /Automation Asset",
  playerData,
  "Player_ID"
);
