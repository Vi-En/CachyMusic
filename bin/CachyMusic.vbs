' CachyMusic v2.0.0 Windows Silent Launcher
' Starts CachyMusic desktop player cleanly without flashing a command prompt window

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir
WshShell.Run "cmd /c """ & strDir & "\cachymusic.bat""", 0, False
Set WshShell = Nothing
Set fso = Nothing
