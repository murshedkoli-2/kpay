param([string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk", [string]$Server = 'http://127.0.0.1:3000', [switch]$Release, [string]$SigningKey, [string]$SigningAlias='kpay', [string]$KeyPassEnv='KPAY_SIGNING_PASSWORD')
$ErrorActionPreference='Stop'
$agentRoot=$PSScriptRoot
$tools=Join-Path $Sdk 'build-tools\35.0.0'
$androidJar=Join-Path $Sdk 'platforms\android-35\android.jar'
$build=Join-Path $agentRoot 'build'
$out=Join-Path $agentRoot '..\artifacts'
$serverUri=[Uri]$Server
if($serverUri.AbsolutePath -ne '/' -or $serverUri.Query -or $serverUri.UserInfo -or $serverUri.Fragment){throw 'Server must be an origin URL without path, query or credentials'}
if($Release -and $serverUri.Scheme -ne 'https'){throw 'Release requires a trusted HTTPS server'}
if(!$Release -and $serverUri.Scheme -ne 'https' -and ($serverUri.Scheme -ne 'http' -or $serverUri.Host -ne '127.0.0.1')){throw 'Development HTTP is restricted to adb reverse at 127.0.0.1'}
if($Release -and (!$SigningKey -or !(Test-Path -LiteralPath $SigningKey))){throw 'Provide a production SigningKey; no development signing for release'}
foreach($path in @($build,"$build\classes","$build\generated\bd\kpay\agent",$out)){New-Item -ItemType Directory -Path $path -Force | Out-Null}
# Remove stale compiled classes so a release cannot inherit debug instrumentation.
Get-ChildItem -LiteralPath "$build\classes" -Recurse -Filter '*.class' | ForEach-Object {Remove-Item -LiteralPath $_.FullName}
function Run([string]$Program,[string[]]$Arguments){ & $Program @Arguments; if($LASTEXITCODE -ne 0){throw "$Program failed: $LASTEXITCODE"} }
$debugLiteral=if($Release){'false'}else{'true'}
$origin=$Server.TrimEnd('/')
Set-Content -LiteralPath "$build\generated\bd\kpay\agent\BuildConfig.java" -Encoding utf8 -Value "package bd.kpay.agent; final class BuildConfig { static final String SERVER = `"$origin`"; static final boolean DEBUG = $debugLiteral; }"
$manifest=Get-Content -LiteralPath "$agentRoot\AndroidManifest.xml" -Raw
if($Release -or $serverUri.Scheme -eq 'https'){$manifest=$manifest.Replace('android:usesCleartextTraffic="true"','android:usesCleartextTraffic="false"')}
if(!$Release){$manifest=$manifest.Replace('<application android:label','<application android:debuggable="true" android:label').Replace('</manifest>','<instrumentation android:name="bd.kpay.agent.SmokeTest" android:targetPackage="bd.kpay.agent" /></manifest>')}
Set-Content -LiteralPath "$build\AndroidManifest.xml" -Value $manifest -Encoding utf8
Run "$tools\aapt2.exe" @('compile','--dir',"$agentRoot\res",'-o',"$build\resources.zip")
Run "$tools\aapt2.exe" @('link','-o',"$build\base.apk",'-I',$androidJar,'--manifest',"$build\AndroidManifest.xml",'--java',"$build\generated",'--min-sdk-version','29','--target-sdk-version','35','--version-code','3','--version-name','1.2',"$build\resources.zip")
$sources=@(Get-ChildItem "$agentRoot\src","$build\generated" -Recurse -Filter '*.java' | ForEach-Object FullName)
if(!$Release){$sources+=@(Get-ChildItem "$agentRoot\test" -Recurse -Filter '*.java' | ForEach-Object FullName)}
Run 'javac' (@('-encoding','UTF-8','--release','8','-classpath',$androidJar,'-d',"$build\classes")+$sources)
$classes=@(Get-ChildItem "$build\classes" -Recurse -Filter '*.class' | ForEach-Object FullName)
Run "$tools\d8.bat" (@('--lib',$androidJar,'--min-api','29','--output',$build)+$classes)
Copy-Item -LiteralPath "$build\base.apk" -Destination "$build\unsigned.apk" -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open("$build\unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$build\classes.dex",'classes.dex') | Out-Null}finally{$zip.Dispose()}
Run "$tools\zipalign.exe" @('-f','-p','4',"$build\unsigned.apk","$build\aligned.apk")
if(!$Release){$SigningKey="$build\development.p12";$SigningAlias='kpay-development';$KeyPassEnv='KPAY_DEBUG_PASSWORD';$env:KPAY_DEBUG_PASSWORD='android';if(!(Test-Path $SigningKey)){Run 'keytool' @('-genkeypair','-keystore',$SigningKey,'-storetype','PKCS12','-alias',$SigningAlias,'-storepass:env',$KeyPassEnv,'-keypass:env',$KeyPassEnv,'-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=kPay Development')}}
$apk=Join-Path $out $(if($Release){'kpay-agent-release.apk'}else{'kpay-agent-debug.apk'})
Run "$tools\apksigner.bat" @('sign','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--ks',$SigningKey,'--ks-key-alias',$SigningAlias,'--ks-pass',"env:$KeyPassEnv",'--key-pass',"env:$KeyPassEnv",'--out',$apk,"$build\aligned.apk")
# No stale incremental-install signature may accompany this standalone APK.
if(Test-Path -LiteralPath ($apk+'.idsig')){Remove-Item -LiteralPath ($apk+'.idsig')}
Run "$tools\apksigner.bat" @('verify','--verbose',$apk)
$checksum=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+(Split-Path -Leaf $apk)
Set-Content -LiteralPath ($apk+'.sha256') -Value $checksum -Encoding utf8
Write-Output "Built $apk"
