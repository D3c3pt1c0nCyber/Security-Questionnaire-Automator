$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$sheet = $wb.Sheets | Where-Object { $_.Name -eq 'Cyber Questionnaire' }

for ($r = 1; $r -le 90; $r++) {
    $val = $sheet.Cells.Item($r, 2).Text
    if ($val -ne '') {
        $display = $val
        if ($display.Length -gt 90) { $display = $display.Substring(0, 90) + '...' }
        Write-Host "R$($r): $display"
    }
}

$wb.Close($false)
$excel.Quit()
