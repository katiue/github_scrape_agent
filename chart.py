import os
import ast
from collections import defaultdict

def parse_python_file(filepath):
    """Parse Python files to capture classes, methods, and standalone functions."""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read(), filename=filepath)
        except SyntaxError:
            return []

    entities = []
    # Only iterate over top-level nodes.
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            methods = []
            for subnode in node.body:
                if isinstance(subnode, ast.FunctionDef):
                    # Store method signature with a visibility indicator.
                    visibility = '+' if not subnode.name.startswith('_') else '-'
                    methods.append(f"{visibility}{subnode.name}()")
            entities.append(('class', node.name, methods))
        elif isinstance(node, ast.FunctionDef):
            entities.append(('function', node.name, []))
    
    return entities

def find_dependency_edges(filepath, default_context, class_set):
    """
    Traverse the AST of a file to find dependency edges.
    
    - Maintains a stack for function (or method) context.
    - Records assignments like: assistant = CodeAssistant()
      so that when a call like assistant.process_query() occurs, it is recorded
      as a call on CodeAssistant.
    - A free call (a call to a name) that matches a known class is marked as an instantiation.
    
    Returns a list of edges in the form (caller, callee, label).
    """
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read(), filename=filepath)
        except SyntaxError:
            return []
    
    var_to_class = {}  # maps variable names to class names

    class DependencyVisitor(ast.NodeVisitor):
        def __init__(self, default_context, var_to_class, class_set):
            # Start with the provided default context (usually module node or main() if available)
            self.func_stack = [default_context]
            self.edges = []
            self.var_to_class = var_to_class
            self.class_set = class_set
            self.class_stack = []  # for nested classes

        def visit_Assign(self, node):
            # Record assignments like: var = CodeAssistant()
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name):
                class_name = node.value.func.id
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.var_to_class[target.id] = class_name
            self.generic_visit(node)

        def visit_ClassDef(self, node):
            self.class_stack.append(node.name)
            self.generic_visit(node)
            self.class_stack.pop()

        def visit_FunctionDef(self, node):
            # Build fully qualified name if inside a class.
            if self.class_stack:
                full_name = self.class_stack[-1] + "." + node.name
            else:
                full_name = node.name
            self.func_stack.append(full_name)
            self.generic_visit(node)
            self.func_stack.pop()

        def visit_Call(self, node):
            current_context = self.func_stack[-1] if self.func_stack else default_context
            if isinstance(node.func, ast.Name):
                # A free function call.
                if node.func.id in self.class_set:
                    # Assume instantiation.
                    callee = node.func.id
                    label = "instantiates"
                else:
                    callee = node.func.id
                    label = "calls"
            elif isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name):
                    caller_name = node.func.value.id
                    method = node.func.attr
                    if caller_name in self.var_to_class:
                        callee = self.var_to_class[caller_name] + "." + method
                    else:
                        callee = caller_name + "." + method
                    label = "calls"
                else:
                    callee = "unknown"
                    label = "calls"
            else:
                callee = "unknown"
                label = "calls"
            self.edges.append((current_context, callee, label))
            self.generic_visit(node)

    visitor = DependencyVisitor(default_context, var_to_class, class_set)
    visitor.visit(tree)
    return visitor.edges

def generate_flowchart_code(base_path):
    """
    Generate Mermaid flowchart code that groups entities by file.
    
    - Each Python file is represented as a subgraph.
    - Each file gets a module-level node (named "<file>_module") to represent top-level code.
    - Classes, functions, and methods are individual nodes.
    - For a class, separate nodes are generated for its methods and an edge labeled "contains" is added.
    - For files like "cli_interface.py", if main() is defined, it is used as the default context for dependency edges.
    - Dependency edges (calls and instantiates) are drawn between nodes (using different colors).
    """
    entities_by_file = defaultdict(list)  # file_stem -> list of entity dicts
    global_entities = {}  # maps an entity identifier (e.g. "main" or "CodeAssistant.process_query") to (file_stem, node_id)
    relationships = []  # list of tuples: (source_node, target_node, label)
    
    excluded_dirs = {'venv', 'env', '.venv', '__pycache__', 'tests'}
    
    # --- First pass: Collect all entities from every Python file ---
    all_files = []
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        for file in files:
            if file.endswith(".py"):
                file_stem = os.path.splitext(file)[0]
                filepath = os.path.join(root, file)
                all_files.append((file_stem, filepath))
                
                # Create module-level node.
                module_node = f"{file_stem}_module"
                if module_node not in global_entities:
                    entities_by_file[file_stem].append({
                        'node_id': module_node,
                        'name': module_node,
                        'type': 'module'
                    })
                    global_entities[module_node] = (file_stem, module_node)
                
                # Parse file for classes and functions.
                for entity_type, name, methods in parse_python_file(filepath):
                    node_id = f"{file_stem}_{name}"
                    if node_id not in global_entities:
                        entities_by_file[file_stem].append({
                            'node_id': node_id,
                            'name': name,
                            'type': entity_type
                        })
                        global_entities[name] = (file_stem, node_id)
                    
                    # For classes, create separate nodes for each method.
                    if entity_type == 'class':
                        for method_sig in methods:
                            # Extract method name (from a signature like "+process_query()").
                            method_name = method_sig[1:].split('(')[0]
                            method_node_id = f"{node_id}_{method_name}"
                            entities_by_file[file_stem].append({
                                'node_id': method_node_id,
                                'name': method_name,
                                'type': 'method'
                            })
                            # Key is "ClassName.methodName"
                            global_entities[f"{name}.{method_name}"] = (file_stem, method_node_id)
                            # Add an edge from the class node to its method.
                            relationships.append((node_id, method_node_id, "contains"))
    
    # --- Second pass: Extract dependency edges from each file ---
    for file_stem, filepath in all_files:
        # Determine default context: if cli_interface and main() exists, use main() node; otherwise, use module node.
        default_context = f"{file_stem}_module"
        if file_stem == "cli_interface":
            for ent in entities_by_file[file_stem]:
                if ent['type'] == 'function' and ent['name'] == "main":
                    default_context = ent['node_id']
                    break
        
        # Build a set of class names defined in this file.
        class_set = {ent['name'] for ent in entities_by_file[file_stem] if ent['type'] == 'class'}
        edges = find_dependency_edges(filepath, default_context, class_set)
        for (source, target, label) in edges:
            if source in global_entities and target in global_entities:
                source_node = global_entities[source][1]
                target_node = global_entities[target][1]
                relationships.append((source_node, target_node, label))
    
    # --- Build the Mermaid flowchart output ---
    flowchart_lines = [
        "%%{init: {",
        "  'theme': 'base',",
        "  'themeVariables': {",
        "    'primaryColor': '#fff',",
        "    'primaryBorderColor': '#000',",
        "    'lineColor': '#000'",
        "  },",
        "  'flowchart': {",
        "    'useMaxWidth': false,",
        "    'htmlLabels': true,",
        "    'nodeSpacing': 50,",
        "    'rankSpacing': 100",
        "  }",
        "}}%%",
        "flowchart TD"
    ]
    
    # Create subgraphs for each file.
    for file_stem, ents in entities_by_file.items():
        flowchart_lines.append(f"subgraph {file_stem}")
        for ent in ents:
            if ent['type'] == 'module':
                flowchart_lines.append(f"    {ent['node_id']}[/\"📦 {file_stem}\"/]")
            elif ent['type'] == 'class':
                flowchart_lines.append(f"    {ent['node_id']}[\"Class: {ent['name']}\"]")
            elif ent['type'] == 'function':
                flowchart_lines.append(f"    {ent['node_id']}(\"Function: {ent['name']}\")")
            elif ent['type'] == 'method':
                flowchart_lines.append(f"    {ent['node_id']}>\"Method: {ent['name']}\"]")
        flowchart_lines.append("end")
    
    # Add some styling definitions.
    flowchart_lines.extend([
        "style cli_interface_module fill:#f0f8ff,stroke:#4682b4",
        "style code_agent_CodeAssistant fill:#f0fff0,stroke:#3cb371",
        "style cli_interface_main fill:#fff0f5,stroke:#ff69b4",
        "style code_agent_CodeAssistant_clean_json_response fill:#fffff0,stroke:#daa520"
    ])
    
    # Define a color palette for edges.
    edge_colors = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD",
        "#FF9F68", "#D4A5A5", "#79B473", "#6C5B7B", "#F8B195"
    ]
    
    # Add dependency edges with different colors.
    for idx, (source, target, label) in enumerate(relationships):
        color = edge_colors[idx % len(edge_colors)]
        flowchart_lines.append(f"{source} --> |\"{label}\"| {target}")
        flowchart_lines.append(f"linkStyle {idx} stroke:{color},stroke-width:2px")
    
    return "\n".join(flowchart_lines)

if __name__ == "__main__":
    folder_path = "./"  # Update this path as needed.
    flowchart_code = generate_flowchart_code(folder_path)
    
    with open("flowchart_diagram.mmd", "w", encoding="utf-8") as f:
        f.write(flowchart_code)
    
    print("Flowchart diagram generated successfully!")
