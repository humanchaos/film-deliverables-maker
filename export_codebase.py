import os

def export_codebase(root_dir, output_file):
    exclusions = {
        'node_modules', '.git', 'dist', 'build', '.DS_Store',
        'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
        'codebase_export.txt', '.gemini', '.agent', '__pycache__',
        'generated-icon.png', 'favicon.ico', 'logo192.png', 'logo512.png',
        'manifest.json', 'robots.txt'
    }
    
    # Extensions to exclude
    binary_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.zip', '.tar', '.gz', '.pyc'}

    with open(output_file, 'w', encoding='utf-8') as f:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Modify dirnames in-place to filter out excluded directories
            dirnames[:] = [d for d in dirnames if d not in exclusions]

            for filename in filenames:
                if filename in exclusions:
                    continue
                
                _, ext = os.path.splitext(filename)
                if ext.lower() in binary_extensions:
                    continue
                
                filepath = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(filepath, root_dir)
                
                # Double check path parts for hidden exclusions
                if any(part in exclusions for part in rel_path.split(os.sep)):
                    continue

                try:
                    with open(filepath, 'r', encoding='utf-8') as code_file:
                        content = code_file.read()
                        f.write(f"--- START OF FILE: {rel_path} ---\n")
                        f.write(content)
                        f.write(f"\n--- END OF FILE: {rel_path} ---\n\n")
                except Exception as e:
                    print(f"Skipping {rel_path}: {e}")

if __name__ == "__main__":
    export_codebase('.', 'codebase_export.txt')
    print("Export complete.")
