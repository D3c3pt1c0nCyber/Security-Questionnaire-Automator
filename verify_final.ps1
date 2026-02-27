$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$checkSheets = @('Licencing Model','Vendor Capabilities','AI','SaaS (Software as a Service)','Web Based','Mobile','On Premise Deployment','Edge deployments')

foreach ($sheet in $wb.Sheets) {
    if ($checkSheets -notcontains $sheet.Name) { continue }
    Write-Host "`n============================================"
    Write-Host "SHEET: $($sheet.Name)"
    Write-Host "============================================"

    for ($r = 1; $r -le 85; $r++) {
        $hasContent = $false
        $rowParts = @()
        for ($c = 1; $c -le 10; $c++) {
            $val = $sheet.Cells.Item($r, $c).Text
            if ($val -ne '') {
                $hasContent = $true
                $display = $val
                if ($display.Length -gt 80) { $display = $display.Substring(0, 80) + '...' }
                $rowParts += "C$($c):[$display]"
            }
        }
        if ($hasContent) {
            Write-Host "  R$($r): $($rowParts -join ' | ')"
        }
    }
}

$wb.Close($false)
$excel.Quit()
Write-Host "`nVerification complete."
