$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

# ================================================================
# FIX 1: LICENCING MODEL - Move answers from Col A to Col B
# ================================================================
$lic = $wb.Sheets | Where-Object { $_.Name -eq 'Licencing Model' }
$fixRows = @(7, 11, 15, 19, 23)
foreach ($r in $fixRows) {
    $answer = $lic.Cells.Item($r, 1).Text
    if ($answer -ne '') {
        $lic.Cells.Item($r, 2) = $answer
        $lic.Cells.Item($r, 1) = ''
    }
}
Write-Host 'Fixed: Licencing Model'

# ================================================================
# FIX 2: VENDOR CAPABILITIES - Move answers from Col A to Col B
# ================================================================
$ven = $wb.Sheets | Where-Object { $_.Name -eq 'Vendor Capabilities' }
$fixRows = @(7, 11, 15, 19, 23, 27)
foreach ($r in $fixRows) {
    $answer = $ven.Cells.Item($r, 1).Text
    if ($answer -ne '') {
        $ven.Cells.Item($r, 2) = $answer
        $ven.Cells.Item($r, 1) = ''
    }
}
Write-Host 'Fixed: Vendor Capabilities'

# ================================================================
# FIX 3: AI - Move answers from Col A to Col B
# ================================================================
$ai = $wb.Sheets | Where-Object { $_.Name -eq 'AI' }
$fixRows = @(6, 10, 14, 17, 21, 25, 29)
foreach ($r in $fixRows) {
    $answer = $ai.Cells.Item($r, 1).Text
    if ($answer -ne '') {
        $ai.Cells.Item($r, 2) = $answer
        $ai.Cells.Item($r, 1) = ''
    }
}
Write-Host 'Fixed: AI'

# ================================================================
# FIX 4: SaaS - Restore overwritten questions, move answers down
# Process BOTTOM-TO-TOP to avoid conflicts
# ================================================================
$saas = $wb.Sheets | Where-Object { $_.Name -eq 'SaaS (Software as a Service)' }

# Each entry: @(absolute_question_row, original_question_text)
$saasQuestions = @(
    @(80, 'Please provide the public facing URL so that AGA may assess its security posture'),
    @(76, 'Data Ownership / Portability: What is your policy on data ownership and portability? Please explain who owns the data stored on your platform and how a customer can export their data if they choose to leave your service.'),
    @(73, 'Data Segregation: How is data segregated between different customers on your SaaS platform? Please describe how customer data is isolated and protected.'),
    @(69, 'Archival / Retirement: What is the solution''s data archival / retirement policy? Is it configurable?'),
    @(62, '4.6. System Dependencies: What other systems does the system require to ensure optimised operation?'),
    @(60, '4.5. Integration Monitoring: Can your product''s integrations be monitored and managed? If so, please describe the tools and capabilities available for monitoring and managing integrations.'),
    @(57, '4.4. Error Handling: What is your product''s error handling process for integrations? Please describe how your product handles errors during integration, such as data conflicts, connectivity issues, etc.'),
    @(53, 'Data Synchronisation: How does your product handle data synchronization with integrated systems? Please describe how data is synchronized between your product and the integrated systems.'),
    @(50, 'Integration Patterns: What integration methods does your product support? Please provide details about the supported integration methods (e.g., APIs, webhooks, file imports/exports, etc.).'),
    @(47, 'Integration requirements: are there any source and destination services / systems that this solution is dependent on? If so please state, in detail, the applications, integration method and ports required if necessary'),
    @(41, 'Redundancy / Failover: What redundancy and failover capabilities does your SaaS platform have? Please provide details about your disaster recovery plan and business continuity measures.'),
    @(38, 'System Scalability / Performance: How do you handle scalability and performance? Please describe how your SaaS product scales to handle increased demand and maintains performance.'),
    @(35, 'System Uptime: What is your uptime guarantee? Please provide details about your Service Level Agreement (SLA) for uptime.'),
    @(32, 'Hosting Locations: Where are your data centres located? Please provide information about the geographical locations of your data centres.'),
    @(29, 'SaaS Hosting Platform: What is your SaaS hosting platform? Please provide details about the platform used for hosting the SaaS product.'),
    @(20, 'Network Requirements: Are there any specific network capabilities, protocols, or bandwidth requirements?'),
    @(16, 'Software Requirements: What are the Browser Requirements?'),
    @(8, 'Deployment options: Is this Software available as an on-premise deployment? If yes, please complete Tab G as well.')
)

foreach ($entry in $saasQuestions) {
    $qRow = $entry[0]
    $qText = $entry[1]
    $answerRow = $qRow + 1

    # Save my answer currently sitting on the question cell
    $myAnswer = $saas.Cells.Item($qRow, 2).Text

    # Restore question text
    $saas.Cells.Item($qRow, 2) = $qText

    # Write answer to the row below
    $saas.Cells.Item($answerRow, 2) = $myAnswer
}
Write-Host 'Fixed: SaaS'

# ================================================================
# FIX 5: WEB BASED - Same issue, restore questions, move answers
# ================================================================
$web = $wb.Sheets | Where-Object { $_.Name -eq 'Web Based' }

$webQuestions = @(
    @(73, 'Please provide the public facing URL so that AGA may assess its security posture'),
    @(69, 'Data Ownership / Portability: What is your policy on data ownership and portability? Please explain who owns the data stored on your platform and how a customer can export their data if they choose to leave your service.'),
    @(66, 'Archival / Retirement: What is the solution''s data archival / retirement policy? Is it configurable?'),
    @(60, '4.6. System Dependencies: What other systems does the system require to ensure optimised operation?'),
    @(58, '4.5. Integration Monitoring: Can your product''s integrations be monitored and managed? If so, please describe the tools and capabilities available for monitoring and managing integrations.'),
    @(55, '4.4. Error Handling: What is your product''s error handling process for integrations? Please describe how your product handles errors during integration, such as data conflicts, connectivity issues, etc.'),
    @(51, 'Data Synchronisation: How does your product handle data synchronization with integrated systems? Please describe how data is synchronized between your product and the integrated systems.'),
    @(48, 'Integration Patterns: What integration methods does your product support? Please provide details about the supported integration methods (e.g., APIs, webhooks, file imports/exports, etc.).'),
    @(45, 'Integration requirements: are there any source and destination services / systems that this solution is dependent on? If so please state, in detail, the applications, integration method and ports required if necessary'),
    @(39, '3. 5. Redundancy / Failover: What redundancy and failover capabilities does your web platform have? Please provide details about your disaster recovery plan and business continuity measures.'),
    @(36, '3. 4. System Scalability / Performance: How do you handle scalability and performance? Please describe how your web product scales to handle increased demand and maintain performance.'),
    @(33, '3.3. System Uptime: What is your uptime guarantee? Please provide details about your Service Level Agreement (SLA) for uptime.'),
    @(30, '3.2. Hosting Locations: Where are your data centres located? Please provide information about the geographical locations of your data centres.'),
    @(27, 'Application Hosting Platform: What is your application hosting platform? Please provide details about the platform used for hosting the SaaS product.'),
    @(18, '1.3 Database requirements: Are there any specific database requirements?'),
    @(14, '1.2 Network Requirements: Are there any specific network capabilities, protocols, or bandwidth requirements?'),
    @(10, '1.1 Software Requirements: What are the Browser Requirements?')
)

foreach ($entry in $webQuestions) {
    $qRow = $entry[0]
    $qText = $entry[1]
    $answerRow = $qRow + 1

    $myAnswer = $web.Cells.Item($qRow, 2).Text
    $web.Cells.Item($qRow, 2) = $qText
    $web.Cells.Item($answerRow, 2) = $myAnswer
}
Write-Host 'Fixed: Web Based'

# ================================================================
# FIX 6: MOBILE - Answers overwrote question numbers in Col B
# Move answers from Col B to Col C (answer row below question)
# Restore question numbers in Col B
# ================================================================
$mob = $wb.Sheets | Where-Object { $_.Name -eq 'Mobile' }

# Each entry: @(absolute_row, question_number, answer_row_offset)
# Questions are at Col C (3), question numbers at Col B (2)
# My answers overwrote Col B question numbers
$mobileEntries = @(
    @(10, '1.1', 11),
    @(14, '1.2', 15),
    @(18, '1.3', 19),
    @(22, '1.4', 23),
    @(26, '1.5', 27),
    @(32, '2.1', 33),
    @(36, '2.2', 37),
    @(40, '2.3', 41),
    @(44, '2.4', 45),
    @(48, '2.3', 49),
    @(52, '2.4', 53),
    @(60, '3.1', 61),
    @(64, '3.2', 65),
    @(72, '4.1', 73),
    @(80, '5.1', 81)
)

# Process bottom-to-top
[array]::Reverse($mobileEntries)

foreach ($entry in $mobileEntries) {
    $qRow = $entry[0]
    $qNum = $entry[1]
    $ansRow = $entry[2]

    # Save my answer from Col B
    $myAnswer = $mob.Cells.Item($qRow, 2).Text

    # Restore question number to Col B
    $mob.Cells.Item($qRow, 2) = $qNum

    # Write answer to answer row in Col B
    $mob.Cells.Item($ansRow, 2) = $myAnswer
}

# Also restore section header text that may have been affected
# Section numbers (1, 2, 3, 4, 5) are at Col A, section titles at Col B
# These should be intact since we only wrote to answer rows

Write-Host 'Fixed: Mobile'

# ================================================================
# FIX 7: ON PREMISE - Restore overwritten header
# ================================================================
$onprem = $wb.Sheets | Where-Object { $_.Name -eq 'On Premise Deployment' }
# R4 currently has my N/A text, should have the section header
# Original: Row 3 (extraction) = R4 (absolute): "On premise deployment - Technical Architecture Questions"
$naNoteOnPrem = $onprem.Cells.Item(4, 2).Text
$onprem.Cells.Item(4, 2) = 'On premise deployment - Technical Architecture Questions'
$onprem.Cells.Item(5, 2) = $naNoteOnPrem
Write-Host 'Fixed: On Premise'

# ================================================================
# FIX 8: EDGE - Restore overwritten header
# ================================================================
$edge = $wb.Sheets | Where-Object { $_.Name -eq 'Edge deployments' }
$naNoteEdge = $edge.Cells.Item(4, 2).Text
$edge.Cells.Item(4, 2) = 'Edge deployments - Technical Architecture Questions'
$edge.Cells.Item(5, 2) = $naNoteEdge
Write-Host 'Fixed: Edge'

# ================================================================
# FIX 9: Application Capabilities - Fix X column markings
# ================================================================
$appCap = $wb.Sheets | Where-Object { $_.Name -eq 'A. Application Capabilities' }
# Clear incorrect X at Col 9 (Third-Party Add-On), set Col 10 (Cannot be Provided)
$appCap.Cells.Item(9, 9) = ''
$appCap.Cells.Item(9, 10) = 'X'
# Clear the Standard Functionality X if still there at Col 7
$appCap.Cells.Item(9, 7) = ''
Write-Host 'Fixed: Application Capabilities'

# ================================================================
# SAVE
# ================================================================
$wb.Save()
$wb.Close($false)
$excel.Quit()
Write-Host ''
Write-Host 'All fixes applied and saved.'
