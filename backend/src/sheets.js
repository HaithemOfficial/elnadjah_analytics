const { google } = require("googleapis");

function buildAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google service account credentials.");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function getSheetRows() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const rangeEnv = process.env.GOOGLE_SHEET_RANGE || "A:Z";
  const gidEnv = process.env.GOOGLE_SHEET_GID || "";

  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID.");
  }

  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });

  let range = rangeEnv;

  if (!range.includes("!") && gidEnv) {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      includeGridData: false,
    });

    const gid = Number(gidEnv);
    const match = metadata.data.sheets?.find(
      (sheet) => sheet.properties?.sheetId === gid
    );

    if (match?.properties?.title) {
      range = `${match.properties.title}!${rangeEnv}`;
    }
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  return response.data.values || [];
}

module.exports = { getSheetRows };
