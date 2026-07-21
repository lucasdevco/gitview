package function

import (
	"path/filepath"
	"strings"

	treesitter "github.com/tree-sitter/go-tree-sitter"
	treesittergo "github.com/tree-sitter/tree-sitter-go/bindings/go"
	treesitterjava "github.com/tree-sitter/tree-sitter-java/bindings/go"
	treesitterjavascript "github.com/tree-sitter/tree-sitter-javascript/bindings/go"
	treesitterpython "github.com/tree-sitter/tree-sitter-python/bindings/go"
	treesitterrust "github.com/tree-sitter/tree-sitter-rust/bindings/go"
	treesittertypescript "github.com/tree-sitter/tree-sitter-typescript/bindings/go"
)

type languageSpec struct {
	name           string
	language       func() *treesitter.Language
	functionKinds  map[string]struct{}
	containerKinds map[string]struct{}
	decisionKinds  map[string]struct{}
}

var languageByExtension = map[string]languageSpec{
	".go":   goLanguage(),
	".js":   javascriptLanguage("JavaScript", func() *treesitter.Language { return treesitter.NewLanguage(treesitterjavascript.Language()) }),
	".jsx":  javascriptLanguage("JavaScript", func() *treesitter.Language { return treesitter.NewLanguage(treesitterjavascript.Language()) }),
	".ts":   javascriptLanguage("TypeScript", func() *treesitter.Language { return treesitter.NewLanguage(treesittertypescript.LanguageTypescript()) }),
	".tsx":  javascriptLanguage("TypeScript", func() *treesitter.Language { return treesitter.NewLanguage(treesittertypescript.LanguageTSX()) }),
	".py":   pythonLanguage(),
	".java": javaLanguage(),
	".rs":   rustLanguage(),
}

func IsSupportedSource(path string) bool {
	_, ok := languageByExtension[strings.ToLower(filepath.Ext(path))]
	return ok
}

func SupportedExtensions() []string {
	return []string{".go", ".java", ".js", ".jsx", ".py", ".rs", ".ts", ".tsx"}
}

func parseFiles(files []SourceFile) (map[string][]*symbol, int, int) {
	byPath := map[string][]*symbol{}
	failures, excluded := 0, 0
	for _, file := range files {
		spec, ok := languageByExtension[strings.ToLower(filepath.Ext(file.Path))]
		if !ok {
			continue
		}
		if isExcludedSource(file.Path) {
			excluded++
			continue
		}
		parser := treesitter.NewParser()
		if err := parser.SetLanguage(spec.language()); err != nil {
			parser.Close()
			failures++
			continue
		}
		tree := parser.Parse(file.Content, nil)
		parser.Close()
		if tree == nil {
			failures++
			continue
		}
		root := tree.RootNode()
		if root.HasError() {
			failures++
		}
		collectFunctions(root, file, spec, byPath)
		tree.Close()
	}
	return byPath, failures, excluded
}

func collectFunctions(node *treesitter.Node, file SourceFile, spec languageSpec, byPath map[string][]*symbol) {
	if _, ok := spec.functionKinds[node.Kind()]; ok {
		if metric, found := functionMetric(node, file, spec); found {
			byPath[file.Path] = append(byPath[file.Path], &symbol{metric: metric, contributors: map[string]*contribution{}, seenCommits: map[string]struct{}{}})
		}
	}
	for index := uint(0); index < node.NamedChildCount(); index++ {
		collectFunctions(node.NamedChild(index), file, spec, byPath)
	}
}

func functionMetric(node *treesitter.Node, file SourceFile, spec languageSpec) (Metric, bool) {
	nameNode := node.ChildByFieldName("name")
	if nameNode == nil && (node.Kind() == "arrow_function" || node.Kind() == "function_expression") {
		parent := node.Parent()
		if parent != nil {
			nameNode = parent.ChildByFieldName("name")
			if nameNode == nil {
				nameNode = parent.ChildByFieldName("key")
			}
		}
	}
	if nameNode == nil {
		return Metric{}, false
	}
	name := strings.TrimSpace(nameNode.Utf8Text(file.Content))
	if name == "" {
		return Metric{}, false
	}
	qualified := qualifiedName(node, name, file.Content, spec)
	body := node.ChildByFieldName("body")
	signatureEnd := node.EndByte()
	if body != nil {
		signatureEnd = body.StartByte()
	}
	signature := strings.TrimSpace(string(file.Content[node.StartByte():signatureEnd]))
	start, end := int(node.StartPosition().Row)+1, int(node.EndPosition().Row)+1
	metric := Metric{
		Name: name, QualifiedName: qualified, Signature: signature, Language: spec.name,
		Path: file.Path, StartLine: start, EndLine: end, Lines: end - start + 1,
		Complexity: functionComplexity(node, spec), LineageConfidence: "probable",
	}
	metric.ID = symbolID(file.Path, qualified, signature)
	return metric, true
}

func qualifiedName(node *treesitter.Node, name string, source []byte, spec languageSpec) string {
	if node.Kind() == "method_declaration" {
		if receiver := node.ChildByFieldName("receiver"); receiver != nil {
			if receiverType := lastDescendant(receiver, map[string]struct{}{"type_identifier": {}}); receiverType != nil {
				return receiverType.Utf8Text(source) + "." + name
			}
		}
	}
	for parent := node.Parent(); parent != nil; parent = parent.Parent() {
		if _, ok := spec.containerKinds[parent.Kind()]; !ok {
			continue
		}
		containerName := parent.ChildByFieldName("name")
		if containerName == nil {
			containerName = parent.ChildByFieldName("type")
		}
		if containerName != nil {
			return strings.TrimSpace(containerName.Utf8Text(source)) + "." + name
		}
	}
	return name
}

func functionComplexity(root *treesitter.Node, spec languageSpec) int {
	value := 1
	var visit func(*treesitter.Node, bool)
	visit = func(node *treesitter.Node, isRoot bool) {
		if !isRoot {
			if _, nested := spec.functionKinds[node.Kind()]; nested {
				return
			}
		}
		if _, ok := spec.decisionKinds[node.Kind()]; ok {
			value++
		}
		if node.Kind() == "binary_expression" || node.Kind() == "boolean_operator" {
			for index := uint(0); index < node.ChildCount(); index++ {
				kind := node.Child(index).Kind()
				if kind == "&&" || kind == "||" || kind == "and" || kind == "or" {
					value++
				}
			}
		}
		for index := uint(0); index < node.NamedChildCount(); index++ {
			visit(node.NamedChild(index), false)
		}
	}
	visit(root, true)
	return value
}

func lastDescendant(node *treesitter.Node, kinds map[string]struct{}) *treesitter.Node {
	var found *treesitter.Node
	if _, ok := kinds[node.Kind()]; ok {
		found = node
	}
	for index := uint(0); index < node.NamedChildCount(); index++ {
		if child := lastDescendant(node.NamedChild(index), kinds); child != nil {
			found = child
		}
	}
	return found
}

func goLanguage() languageSpec {
	return languageSpec{
		name: "Go", language: func() *treesitter.Language { return treesitter.NewLanguage(treesittergo.Language()) },
		functionKinds:  set("function_declaration", "method_declaration"),
		containerKinds: set(),
		decisionKinds:  set("if_statement", "for_statement", "expression_case", "type_case", "communication_case"),
	}
}

func javascriptLanguage(name string, language func() *treesitter.Language) languageSpec {
	return languageSpec{
		name: name, language: language,
		functionKinds:  set("function_declaration", "generator_function_declaration", "method_definition", "arrow_function", "function_expression"),
		containerKinds: set("class_declaration", "class"),
		decisionKinds:  set("if_statement", "for_statement", "for_in_statement", "while_statement", "do_statement", "switch_case", "catch_clause", "ternary_expression"),
	}
}

func pythonLanguage() languageSpec {
	return languageSpec{
		name: "Python", language: func() *treesitter.Language { return treesitter.NewLanguage(treesitterpython.Language()) },
		functionKinds: set("function_definition"), containerKinds: set("class_definition"),
		decisionKinds: set("if_statement", "elif_clause", "for_statement", "while_statement", "case_clause", "except_clause", "conditional_expression", "list_comprehension", "set_comprehension", "dictionary_comprehension", "generator_expression"),
	}
}

func javaLanguage() languageSpec {
	return languageSpec{
		name: "Java", language: func() *treesitter.Language { return treesitter.NewLanguage(treesitterjava.Language()) },
		functionKinds:  set("method_declaration", "constructor_declaration"),
		containerKinds: set("class_declaration", "interface_declaration", "enum_declaration", "record_declaration"),
		decisionKinds:  set("if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement", "switch_label", "catch_clause", "ternary_expression"),
	}
}

func rustLanguage() languageSpec {
	return languageSpec{
		name: "Rust", language: func() *treesitter.Language { return treesitter.NewLanguage(treesitterrust.Language()) },
		functionKinds: set("function_item"), containerKinds: set("impl_item", "trait_item"),
		decisionKinds: set("if_expression", "for_expression", "while_expression", "loop_expression", "match_arm"),
	}
}

func set(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func isExcludedSource(path string) bool {
	normalized := "/" + strings.Trim(filepath.ToSlash(path), "/") + "/"
	return strings.Contains(normalized, "/vendor/") || strings.Contains(normalized, "/node_modules/")
}
