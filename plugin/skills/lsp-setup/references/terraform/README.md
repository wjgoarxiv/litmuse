# Terraform: language-server and checker setup

- **Server id:** `terraform` with launch line `terraform-ls serve`
- **Extensions:** .tf .tfvars
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use terraform validate -json (after the user has run terraform init) and terraform fmt -check

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install hashicorp/tap/terraform-ls`
- Linux: release zip from https://github.com/hashicorp/terraform-ls/releases, or the HashiCorp apt or dnf repository
- Windows: `choco install terraform-ls`
- The `terraform` binary must be installed too.

Confirm afterwards:

```bash
command -v terraform-ls terraform
```

`terraform validate` needs an initialised working directory; running `terraform init` downloads providers, so the user runs it.

## Project configuration

- `.terraform.lock.hcl` and the `.terraform/` provider cache; a `versions.tf` pinning `required_version`.

```hcl
terraform {
  required_version = ">= 1.6"
}
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `tflint` | lint CLI |

## Troubleshooting

- **PATH:** both `terraform-ls` and `terraform` must resolve.
- **No provider completion:** `terraform init` has not been run.
- **`.tfvars` not analysed:** open the containing module so the server has root context.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
