$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$sheet = $wb.Sheets | Where-Object { $_.Name -eq 'Cyber Questionnaire' }
$ur = $sheet.UsedRange
Write-Host ("UsedRange: Row={0} Col={1} Rows={2} Cols={3}" -f $ur.Row, $ur.Column, $ur.Rows.Count, $ur.Columns.Count)

for ($r = 1; $r -le 100; $r++) {
    $hasContent = $false
    $parts = @()
    for ($c = 1; $c -le 5; $c++) {
        $val = $sheet.Cells.Item($r, $c).Text
        if ($val -ne '') {
            $hasContent = $true
            $display = $val
            if ($display.Length -gt 100) { $display = $display.Substring(0, 100) + '...' }
            $parts += "C$($c):[$display]"
        }
    }
    if ($hasContent) {
        Write-Host "R$($r): $($parts -join ' | ')"
    }
}

$wb.Close($false)
$excel.Quit()
