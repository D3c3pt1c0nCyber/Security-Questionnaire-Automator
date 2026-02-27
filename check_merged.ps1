$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$sheet = $wb.Sheets | Where-Object { $_.Name -eq 'Cyber Questionnaire' }

# Check answer rows for merged cells
$answerRows = @(7, 10, 14, 17, 20, 23, 25, 27, 29, 31, 36, 40, 44, 48, 52, 56, 63, 66, 74, 78, 82, 86)

foreach ($r in $answerRows) {
    $cell = $sheet.Cells.Item($r, 2)
    $merged = $cell.MergeCells
    $mergeArea = $cell.MergeArea.Address()
    $val = $cell.Text
    $display = $val
    if ($display.Length -gt 60) { $display = $display.Substring(0, 60) + '...' }
    Write-Host ("R{0} C2: Merged={1} MergeArea={2} Value=[{3}]" -f $r, $merged, $mergeArea, $display)
}

# Also check the question rows
Write-Host "`nQuestion rows:"
$questionRows = @(6, 9, 13, 16, 19, 22, 24, 26, 28, 30, 35, 39, 43, 47, 51, 55, 62, 65, 73, 77, 81, 85)
foreach ($r in $questionRows) {
    $cell = $sheet.Cells.Item($r, 2)
    $merged = $cell.MergeCells
    $mergeArea = $cell.MergeArea.Address()
    Write-Host ("R{0} C2: Merged={1} MergeArea={2}" -f $r, $merged, $mergeArea)
}

$wb.Close($false)
$excel.Quit()
