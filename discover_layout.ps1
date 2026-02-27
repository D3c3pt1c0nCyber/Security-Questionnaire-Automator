$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$checkSheets = @('Licencing Model','Vendor Capabilities','AI','SaaS (Software as a Service)','Web Based','Mobile','On Premise Deployment','Edge deployments')

foreach ($sheet in $wb.Sheets) {
    if ($checkSheets -notcontains $sheet.Name) { continue }
    $ur = $sheet.UsedRange
    Write-Host ("SHEET: {0} | UsedRange starts at Row={1} Col={2}" -f $sheet.Name, $ur.Row, $ur.Column)
}

$wb.Close($false)
$excel.Quit()
