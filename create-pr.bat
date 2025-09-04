@echo off
setlocal enabledelayedexpansion

:: Get current branch name
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i

:: Get remote origin URL
for /f "tokens=*" %%i in ('git config --get remote.origin.url') do set ORIGIN_URL=%%i

:: Extract GitHub repo info from URL
set REPO_URL=%ORIGIN_URL%
set REPO_URL=%REPO_URL:.git=%
set REPO_URL=%REPO_URL:git@github.com:=https://github.com/%

echo Current branch: %CURRENT_BRANCH%

:: Determine target branch based on current branch
if "%CURRENT_BRANCH%"=="develop" (
    set TARGET_BRANCH=master
    echo Creating PR from develop to master
) else if "%CURRENT_BRANCH:~0,8%"=="feature/" (
    set TARGET_BRANCH=develop
    echo Creating PR from %CURRENT_BRANCH% to develop
) else (
    echo Warning: Current branch is neither 'develop' nor starts with 'feature/'
    echo Defaulting to develop as target branch
    set TARGET_BRANCH=develop
)

:: Construct GitHub PR URL
set PR_URL=%REPO_URL%/compare/%TARGET_BRANCH%...%CURRENT_BRANCH%?expand=1

echo Opening PR URL: %PR_URL%

:: Open URL in default browser
start "" "%PR_URL%"