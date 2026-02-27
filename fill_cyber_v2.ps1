$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$filePath = 'C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx'

# Check if file is locked
try {
    $stream = [System.IO.File]::Open($filePath, 'Open', 'ReadWrite', 'None')
    $stream.Close()
    Write-Host 'File is not locked. Proceeding...'
} catch {
    Write-Host 'WARNING: File may be open in another application. Please close Excel first!'
    Write-Host $_.Exception.Message
    exit 1
}

$wb = $excel.Workbooks.Open($filePath)
$sheet = $wb.Sheets | Where-Object { $_.Name -eq 'Cyber Questionnaire' }

# Define all Q&A pairs: @(answer_row, answer_text)
$answers = @{
    7 = 'Convergence LMS supports SAML 2.0-based Single Sign-On (SSO), username/password authentication, and Multi-Factor Authentication (MFA). Customers may also leverage their identity provider (IdP) for federated authentication.'
    10 = 'Yes, via SAML 2.0. Provided your AD supports SAML, our platform will integrate with your AD using SAML. Supported measures include user provisioning, password policies, group identification, and MFA.'
    14 = 'Yes. MFA is supported and can be enforced through your organization''s Identity Provider (IdP) via SAML 2.0. When SSO is configured, your IdP''s MFA policies apply to all Convergence LMS sessions.'
    17 = 'Yes. Convergence LMS supports SSO via SAML 2.0. Integration with major IdPs including Azure Active Directory, Okta, and other SAML-compliant providers is supported.'
    20 = 'Convergence LMS has 8 pre-configured roles including: master, admin, content developer, assign training, credit training, tasklist check-off, report viewer, read role, and everyone. Each customer is responsible for managing their users and their admins/security level roles. See more information: https://support.vectorlmsconvergencetrainingedition.com/s/article/Security-Roles-Overview'
    23 = 'Yes. Convergence LMS logs user sessions including login events, logouts, and key system activity. Audit logs are maintained and monitored through Vector Solutions'' 24/7 Security Operations Center (SOC). Log retention follows Vector Solutions'' internal data retention policy; specific retention periods are available upon request.'
    25 = 'Depending on what is meant here, Vector Solutions provides remote (web-based) support for our customers, however, we do not remotely access your computers. Vector provides all ongoing customer and technical support and maintenance.'
    27 = 'We use physical, electronic, and administrative safeguards to protect your data and platform instance from loss, misuse, and unauthorized access. The platform and data is hosted by Microsoft Azure and includes many safeguards to prevent unauthorized access. In addition, Vector follows NIST Cybersecurity Framework for best practices related to preventing and detecting any security events or incidents.'
    29 = 'Vector utilizes the principle of least privilege to ensure that users only have the minimum, necessary access required to perform tasks. End users (customer users) may use the aforementioned roles to manage their users'' access to the platform features and data. Internally, Vector Solutions uses session monitoring, unique passwords, and other safeguards to manage our internal users who have access to customer data.'
    31 = 'Convergence LMS is a cloud-based SaaS application accessed through a standard web browser and does not require traditional software installation or deployment. It is therefore not deployed via Intune. However, Convergence is fully compatible with Intune-managed devices. Users on Intune-managed endpoints can access the platform via any supported browser (Chrome, Edge, Firefox, Safari) without additional configuration.'
    36 = 'Convergence LMS is a SaaS (Software-as-a-Service) platform delivered entirely through a secure web browser over HTTPS; it is not distributed as downloadable or installable software. As such, traditional executable code signing does not apply. The platform is served via TLS-encrypted connections with publicly trusted SSL certificates. The underlying infrastructure on Microsoft Azure uses Microsoft''s digitally signed and security-hardened software stack.'
    40 = 'Convergence LMS uses TLS/SSL certificates (publicly trusted CA-issued) to secure all client-server communications over HTTPS. For user authentication, SAML 2.0 SSO is supported, which can leverage X.509 certificates within your Identity Provider (IdP) for assertion signing and encryption. Direct certificate-based client authentication (mutual TLS) at the user level is not a native platform feature; authentication is managed through the IdP.'
    44 = 'As a provider of SaaS solutions, we are extremely vigilant about data security, confidentiality of learner records, and the potential for breaches. From a hosting perspective, we start by selecting a premium-tier cloud hosting partner with the highest levels of security compliance in Microsoft Azure. Vector LMS, Convergence Edition, employs SSL encryption, daily back-ups, fault tolerance, reCAPTCHA, and off-site storage, among other protections. AES-256 is employed and all data is encrypted in transit and at rest.'
    48 = 'Yes. All data transmissions are secured using TLS 1.2 and TLS 1.3. Older, deprecated versions (SSL 3.0, TLS 1.0, TLS 1.1) are not supported.'
    52 = 'Convergence LMS operates on Microsoft Azure, which maintains SOC 2, ISO 27001, FedRAMP, and numerous other certifications. Vector Solutions'' cybersecurity program is aligned with the NIST Cybersecurity Framework (CSF), CIS Controls 18, NIST 800-171, and NIST 800-53. Azure''s compliance documentation is publicly available via the Microsoft Trust Center.'
    56 = 'Yes, Convergence LMS undergoes internal and external penetration tests. Scope, findings, and remediation are available under signed mutual NDA only.'
    63 = 'Convergence LMS employs a comprehensive backup strategy hosted on Microsoft Azure: Frequency: Daily automated backups are performed. Backup Types: Full and incremental backups are supported through Azure''s backup services. Backup Locations: Backups are stored in geographically redundant Azure storage (GRS), ensuring copies exist in multiple data center regions. Security Measures: All backup data is encrypted at rest using AES-256. Retention Duration: Backup retention follows Vector Solutions'' internal data retention policies; specific details available upon request.'
    66 = 'Yes. Convergence LMS leverages Microsoft Azure''s enterprise-grade disaster recovery infrastructure, including geo-redundant storage and automated failover capabilities. In the event of a regional outage, failover to secondary Azure regions can be initiated. Recovery Time Objective (RTO) and Recovery Point Objective (RPO) targets are defined within Vector Solutions'' Business Continuity Plan and are available upon request.'
    74 = 'Customer data is retained on the Convergence LMS platform for the duration of the active contract. Customers may request a full data export at any time during the contract term or at contract termination. Following contract expiration, data is retained for a grace period (typically 30-90 days) before secure deletion per Vector Solutions'' data disposal procedures. Specific archival and retention configurations can be discussed and contractually agreed upon.'
    78 = 'Vector Solutions maintains compliance with applicable data privacy regulations including GDPR, CCPA, FERPA, and COPPA. Our Data Processing Agreement (DPA) outlines our obligations as a data processor and is available at https://www.vectorsolutions.com/dpa/. For POPIA (South Africa) and LGPD (Brazil) compliance, our DPA and contractual terms provide the applicable protections. Data is processed and stored in US-based Microsoft Azure data centers.'
    82 = 'Yes, the platform houses first name, last name, and email address. We use commercially available safeguards to protect your data, including AES-256 encryption at rest, TLS in transit, role-based access controls, and 24/7 security monitoring.'
    86 = 'The Customer retains full ownership of all data stored on Convergence LMS. Customers may request a complete data export at any time during the contract period or upon termination. Data is exportable in standard formats (CSV, Excel). Upon contract termination and after the grace period, all customer data is permanently and securely deleted.'
}

$count = 0
foreach ($row in ($answers.Keys | Sort-Object)) {
    $text = $answers[$row]
    $sheet.Cells.Item($row, 2).Value2 = $text

    # Verify
    $check = $sheet.Cells.Item($row, 2).Text
    if ($check -ne '') {
        $count++
    } else {
        Write-Host "WARNING: R$row did not write correctly!"
    }
}

Write-Host "Wrote $count answers out of $($answers.Count) total."

$wb.Save()
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($sheet) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host 'Done. Cyber Questionnaire filled and saved.'
