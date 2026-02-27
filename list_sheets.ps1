$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')
Write-Host "Sheets in workbook:"
foreach ($sheet in $wb.Sheets) {
    Write-Host "  - $($sheet.Name)"
}
$wb.Close($false)
$excel.Quit()
