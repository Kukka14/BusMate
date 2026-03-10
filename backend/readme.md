1. *Create a Virtual Environment*:
   powershell
   python -m venv .venv
   

2. *Activate the Virtual Environment*:
   powershell
   .\.venv\Scripts\Activate.ps1
   
   Note: If you get a "Script execution is disabled" error, run Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process in your terminal first.

3. *Install Dependencies*:
   powershell
   # Use the venv's python directly to ensure no permission/global lock issues
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt


4.   python app.py