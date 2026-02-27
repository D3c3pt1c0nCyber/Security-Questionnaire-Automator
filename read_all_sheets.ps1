$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$skipSheets = @('Cyber Questionnaire')

foreach ($sheet in $wb.Sheets) {
    if ($skipSheets -contains $sheet.Name) { continue }

    Write-Host "`n========== SHEET: $($sheet.Name) =========="
    $usedRange = $sheet.UsedRange
    if ($null -eq $usedRange) { continue }

    $rowCount = $usedRange.Rows.Count
    $colCount = $usedRange.Columns.Count

    for ($r = 1; $r -le [Math]::Min($rowCount, 200); $r++) {
        $rowHasContent = $false
        $rowData = @()
        for ($c = 1; $c -le [Math]::Min($colCount, 10); $c++) {
            $cell = $usedRange.Cells.Item($r, $c)
            $val = $cell.Text
            $rowData += $val
            if ($val -ne '') { $rowHasContent = $true }
        }
        if ($rowHasContent) {
            Write-Host ("Row {0}: {1}" -f $r, ($rowData -join " | "))
        }
    }
}

$wb.Close($false)
$excel.Quit()
