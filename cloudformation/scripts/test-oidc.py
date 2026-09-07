"""OIDC trust boundary regression checks. Requires PyYAML (included with cfn-lint)."""
from pathlib import Path
import unittest
import yaml


class TemplateLoader(yaml.SafeLoader):
    pass


TemplateLoader.add_multi_constructor("!", lambda loader, tag, node: loader.construct_scalar(node))
TEMPLATE = Path(__file__).resolve().parents[1] / "templates/apne1/nazotoki-cfn-code.yaml"


class OidcTrustTest(unittest.TestCase):
    def test_only_exact_repository_main_subjects_are_trusted(self):
        template = yaml.load(TEMPLATE.read_text(), Loader=TemplateLoader)
        statement = template["Resources"]["githubActionsDeployRole"]["Properties"]["AssumeRolePolicyDocument"]["Statement"][0]
        condition = statement["Condition"]
        self.assertEqual(set(condition), {"StringEquals"})
        values = condition["StringEquals"]
        self.assertEqual(values["token.actions.githubusercontent.com:aud"], "sts.amazonaws.com")
        subjects = values["token.actions.githubusercontent.com:sub"]
        defaults = {k: str(v["Default"]) for k, v in template["Parameters"].items()}
        resolved = []
        for subject in subjects:
            for key, value in defaults.items():
                subject = subject.replace("${" + key + "}", value)
            self.assertNotIn("*", subject)
            self.assertNotIn("?", subject)
            resolved.append(subject)
        legacy = "repo:Esystimsesys/nazotoki-portal:ref:refs/heads/main"
        immutable = "repo:Esystimsesys@47743231/nazotoki-portal@1335049150:ref:refs/heads/main"
        self.assertCountEqual(resolved, [legacy, immutable])
        for subject in [legacy, immutable]:
            for unexpected in [
                subject.replace("Esystimsesys", "Esystimsesys-other"),
                subject.replace("nazotoki-portal", "nazotoki-portal-other"),
                subject.replace("refs/heads/main", "refs/heads/dev"),
                subject.replace("ref:refs/heads/main", "pull_request"),
                subject.replace("ref:refs/heads/main", "environment:production"),
            ]:
                self.assertNotIn(unexpected, resolved)
        self.assertNotIn(immutable.replace("47743231", "99999999"), resolved)
        self.assertNotIn(immutable.replace("1335049150", "99999999"), resolved)


if __name__ == "__main__":
    unittest.main()
