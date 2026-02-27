$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$checkSheets = @('Licencing Model','Vendor Capabilities','AI','SaaS (Software as a Service)','Web Based','Mobile','On Premise Deployment','Edge deployments','A. Application Capabilities')

foreach ($sheet in $wb.Sheets) {
    if ($checkSheets -notcontains $sheet.Name) { continue }
    Write-Host "`n============================================"
    Write-Host "SHEET: $($sheet.Name)"
    Write-Host "============================================"
    $usedRange = $sheet.UsedRange
    if ($null -eq $usedRange) {
        Write-Host "  (empty sheet)"
        continue
    }
    $rowCount = $usedRange.Rows.Count
    $colCount = $usedRange.Columns.Count
    Write-Host "  Used range: $rowCount rows x $colCount cols"

    for ($r = 1; $r -le [Math]::Min($rowCount, 100); $r++) {
        $rowContent = @()
        $hasContent = $false
        for ($c = 1; $c -le [Math]::Min($colCount, 10); $c++) {
            $val = $sheet.Cells.Item($r, $c).Text
            if ($val -ne '') {
                $hasContent = $true
                $display = $val
                if ($display.Length -gt 90) { $display = $display.Substring(0, 90) + '...' }
                $rowContent += "C$($c):[$display]"
            }
        }
        if ($hasContent) {
            Write-Host "  R$($r): $($rowContent -join ' | ')"
        }
    }
}

$wb.Close($false)
$excel.Quit()
Write-Host "`nAudit complete."
