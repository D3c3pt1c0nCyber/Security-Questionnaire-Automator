$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$checkSheets = @('Licencing Model','Vendor Capabilities','AI','SaaS (Software as a Service)','Web Based','Mobile','On Premise Deployment','Edge deployments')

foreach ($sheet in $wb.Sheets) {
    if ($checkSheets -notcontains $sheet.Name) { continue }
    Write-Host "`n=== $($sheet.Name) ==="
    # Check first answer cell
    $val = $sheet.UsedRange.Cells.Item(4, 1).Text
    if ($val -eq '') { $val = $sheet.UsedRange.Cells.Item(4, 2).Text }
    if ($val -ne '') {
        Write-Host "Row 4: $($val.Substring(0, [Math]::Min(80, $val.Length)))..."
    }
    # Check a mid answer
    $val2 = $sheet.UsedRange.Cells.Item(7, 1).Text
    if ($val2 -eq '') { $val2 = $sheet.UsedRange.Cells.Item(7, 2).Text }
    if ($val2 -ne '') {
        Write-Host "Row 7: $($val2.Substring(0, [Math]::Min(80, $val2.Length)))..."
    }
    $val3 = $sheet.UsedRange.Cells.Item(8, 2).Text
    if ($val3 -ne '') {
        Write-Host "Row 8 col B: $($val3.Substring(0, [Math]::Min(80, $val3.Length)))..."
    }
}

$wb.Close($false)
$excel.Quit()
Write-Host "`nVerification complete."
