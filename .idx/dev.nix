{ pkgs, ... }: {
  channel = "stable-24.11";
  packages = [
    pkgs.nodejs_20
    pkgs.python3
    pkgs.git
    pkgs.rustc
    pkgs.cargo
    pkgs.gcc
    pkgs.gnumake
  ];
  idx.extensions = [
    "christian-kohler.path-intellisense"
    "dbaeumer.vscode-eslint"
    "esbenp.prettier-vscode"
    "bradlc.vscode-tailwindcss"
    "rust-lang.rust-analyzer"
  ];
  idx.previews = {
    enable = true;
    previews = {
      web = {
        command = [
          "sh"
          "-c"
          "cd apps/web && npm run dev -- --port $PORT --hostname 0.0.0.0"
        ];
        manager = "web";
      };
    };
  };
  onCreate = {
    npm-install = "npm install";
  };
}
