$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$answerSheets = @('Licencing Model','Vendor Capabilities','AI','SaaS (Software as a Service)','Web Based','Mobile','A. Application Capabilities')

foreach ($sheet in $wb.Sheets) {
    if ($answerSheets -notcontains $sheet.Name) { continue }

    Write-Host "`n========== SHEET: $($sheet.Name) =========="
    $usedRange = $sheet.UsedRange
    if ($null -eq $usedRange) { continue }

    $rowCount = $usedRange.Rows.Count

    for ($r = 1; $r -le [Math]::Min($rowCount, 100); $r++) {
        # Get columns A (1), B (2), C (3) - question is usually in col B, answer in col B rows after
        $colA = $usedRange.Cells.Item($r, 1).Text
        $colB = $usedRange.Cells.Item($r, 2).Text
        $colC = $usedRange.Cells.Item($r, 3).Text

        if ($colA -ne '' -or $colB -ne '' -or $colC -ne '') {
            Write-Host ("R{0} | A: [{1}] | B: [{2}] | C: [{3}]" -f $r, $colA, $colB, $colC)
        }
    }
}

$wb.Close($false)
$excel.Quit()
