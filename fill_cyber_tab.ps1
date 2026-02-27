$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\joie.sayen\Downloads\20260212 AGA Digital Technology Questionnaire.xlsx')

$sheet = $wb.Sheets | Where-Object { $_.Name -eq 'Cyber Questionnaire' }

# R6: User Authentication -> Answer at R7
$sheet.Cells.Item(7, 2) = 'Convergence LMS supports SAML 2.0-based Single Sign-On (SSO), username/password authentication, and Multi-Factor Authentication (MFA). Customers may also leverage their identity provider (IdP) for federated authentication.'

# R9: AD Integration -> Answer at R10
$sheet.Cells.Item(10, 2) = 'Yes, via SAML 2.0. Provided your AD supports SAML, our platform will integrate with your AD using SAML. Supported measures include user provisioning, password policies, group identification, and MFA.'

# R13: MFA -> Answer at R14
$sheet.Cells.Item(14, 2) = 'Yes. MFA is supported and can be enforced through your organization''s Identity Provider (IdP) via SAML 2.0. When SSO is configured, your IdP''s MFA policies apply to all Convergence LMS sessions.'

# R16: SSO -> Answer at R17
$sheet.Cells.Item(17, 2) = 'Yes. Convergence LMS supports SSO via SAML 2.0. Integration with major IdPs including Azure Active Directory, Okta, and other SAML-compliant providers is supported.'

# R19: User roles -> Answer at R20
$sheet.Cells.Item(20, 2) = 'Convergence LMS has 8 pre-configured roles including: master, admin, content developer, assign training, credit training, tasklist check-off, report viewer, read role, and everyone. Each customer is responsible for managing their users and their admins/security level roles. See more information on our support site: https://support.vectorlmsconvergencetrainingedition.com/s/article/Security-Roles-Overview'

# R22: Session Monitoring -> Answer at R23
$sheet.Cells.Item(23, 2) = 'Yes. Convergence LMS logs user sessions including login events, logouts, and key system activity. Audit logs are maintained and monitored through Vector Solutions'' 24/7 Security Operations Center (SOC). Log retention follows Vector Solutions'' internal data retention policy; specific retention periods are available upon request.'

# R24: Remote support -> Answer at R25
$sheet.Cells.Item(25, 2) = 'Depending on what is meant here, Vector Solutions provides remote (web-based) support for our customers, however, we do not remotely access your computers. Vector provides all ongoing customer and technical support and maintenance.'

# R26: Unauthorized Access -> Answer at R27
$sheet.Cells.Item(27, 2) = 'We use physical, electronic, and administrative safeguards to protect your data and platform instance from loss, misuse, and unauthorized access. The platform and data is hosted by Microsoft Azure and includes many safeguards to prevent unauthorized access. In addition, Vector follows NIST Cybersecurity Framework for best practices related to preventing and detecting any security events or incidents.'

# R28: PAM -> Answer at R29
$sheet.Cells.Item(29, 2) = 'Vector utilizes the principle of least privilege to ensure that users only have the minimum, necessary access required to perform tasks. End users (customer users) may use the aforementioned roles to manage their users'' access to the platform features and data. Internally, Vector Solutions uses session monitoring, unique passwords, and other safeguards to manage our internal users who have access to customer data.'

# R30: Intune Compatibility -> Answer at R31
$sheet.Cells.Item(31, 2) = 'Convergence LMS is a cloud-based SaaS application accessed through a standard web browser and does not require traditional software installation or deployment. It is therefore not deployed via Intune. However, Convergence is fully compatible with Intune-managed devices. Users on Intune-managed endpoints can access the platform via any supported browser (Chrome, Edge, Firefox, Safari) without additional configuration. Device-level compliance policies enforced by Intune apply as normal.'

# R35: Digitally Signed Software -> Answer at R36
$sheet.Cells.Item(36, 2) = 'Convergence LMS is a SaaS (Software-as-a-Service) platform delivered entirely through a secure web browser over HTTPS; it is not distributed as downloadable or installable software. As such, traditional executable code signing does not apply. The platform is served via TLS-encrypted connections with publicly trusted SSL certificates. The underlying infrastructure on Microsoft Azure uses Microsoft''s digitally signed and security-hardened software stack.'

# R39: Software Certificates -> Answer at R40
$sheet.Cells.Item(40, 2) = 'Convergence LMS uses TLS/SSL certificates (publicly trusted CA-issued) to secure all client-server communications over HTTPS. For user authentication, SAML 2.0 SSO is supported, which can leverage X.509 certificates within your Identity Provider (IdP) for assertion signing and encryption. Direct certificate-based client authentication (mutual TLS) at the user level is not a native platform feature; authentication is managed through the IdP.'

# R43: Encryption -> Answer at R44
$sheet.Cells.Item(44, 2) = 'As a provider of SaaS solutions, we are extremely vigilant about data security, confidentiality of learner records, and the potential for breaches. From a hosting perspective, we start by selecting a premium-tier cloud hosting partner with the highest levels of security compliance in Microsoft Azure. Vector LMS, Convergence Edition, employs SSL encryption, daily back-ups, fault tolerance, reCAPTCHA, and off-site storage, among other protections. AES-256 is employed and all data is encrypted in transit and at rest.'

# R47: Data Transmission -> Answer at R48
$sheet.Cells.Item(48, 2) = 'Yes. All data transmissions are secured using TLS 1.2 and TLS 1.3. Older, deprecated versions (SSL 3.0, TLS 1.0, TLS 1.1) are not supported.'

# R51: Cybersecurity Certification -> Answer at R52
$sheet.Cells.Item(52, 2) = 'Convergence LMS operates on Microsoft Azure, which maintains SOC 2, ISO 27001, FedRAMP, and numerous other certifications. Vector Solutions'' cybersecurity program is aligned with the NIST Cybersecurity Framework (CSF), CIS Controls 18, NIST 800-171, and NIST 800-53. Azure''s compliance documentation is publicly available via the Microsoft Trust Center.'

# R55: Penetration Testing -> Answer at R56
$sheet.Cells.Item(56, 2) = 'Yes, Convergence LMS undergoes internal and external penetration tests. Scope, findings, and remediation are available under signed mutual NDA only.'

# R62: System Backups -> Answer at R63
$sheet.Cells.Item(63, 2) = 'Convergence LMS employs a comprehensive backup strategy hosted on Microsoft Azure: Frequency: Daily automated backups are performed. Backup Types: Full and incremental backups are supported through Azure''s backup services. Backup Locations: Backups are stored in geographically redundant Azure storage (GRS), ensuring copies exist in multiple data center regions. Security Measures: All backup data is encrypted at rest using AES-256, consistent with production data security standards. Retention Duration: Backup retention follows Vector Solutions'' internal data retention policies; specific retention period details are available upon request.'

# R65: Disaster Recovery -> Answer at R66
$sheet.Cells.Item(66, 2) = 'Yes. Convergence LMS leverages Microsoft Azure''s enterprise-grade disaster recovery infrastructure, including geo-redundant storage and automated failover capabilities. In the event of a regional outage, failover to secondary Azure regions can be initiated. Recovery Time Objective (RTO) and Recovery Point Objective (RPO) targets are defined within Vector Solutions'' Business Continuity Plan and are available upon request.'

# R73: Archival / Retirement -> Answer at R74
$sheet.Cells.Item(74, 2) = 'Customer data is retained on the Convergence LMS platform for the duration of the active contract. Customers may request a full data export at any time during the contract term or at contract termination. Following contract expiration, data is retained for a defined grace period (typically 30-90 days) before being securely deleted in accordance with Vector Solutions'' data disposal procedures. Specific archival and retention configurations can be discussed and contractually agreed upon.'

# R77: Data Privacy -> Answer at R78
$sheet.Cells.Item(78, 2) = 'Vector Solutions maintains compliance with applicable data privacy regulations including GDPR, CCPA, FERPA, and COPPA. Our Data Processing Agreement (DPA) outlines our obligations as a data processor and is available at https://www.vectorsolutions.com/dpa/. For POPIA (South Africa) and LGPD (Brazil) compliance, our DPA and contractual terms provide the applicable protections. Data is processed and stored in US-based Microsoft Azure data centers. Customers retain ownership of their data throughout the contract period.'

# R81: PII -> Answer at R82
$sheet.Cells.Item(82, 2) = 'Yes, the platform houses first name, last name, and email address. We use commercially available safeguards to protect your data, including AES-256 encryption at rest, TLS in transit, role-based access controls, and 24/7 security monitoring.'

# R85: Data Ownership / Portability -> Answer at R86
$sheet.Cells.Item(86, 2) = 'The Customer retains full ownership of all data stored on Convergence LMS. Customers may request a complete data export at any time during the contract period or upon termination. Data is exportable in standard formats (CSV, Excel). Upon contract termination and after the grace period, all customer data is permanently and securely deleted from the platform.'

$wb.Save()
$wb.Close($false)
$excel.Quit()
Write-Host 'Cyber Questionnaire tab filled and saved.'
