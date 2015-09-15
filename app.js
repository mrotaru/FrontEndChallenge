var GitHubApp = angular.module('GitHubApp', ['ngRoute', 'ngResource']);

var GitHubApp

GitHubApp
  .config(function($routeProvider){

    $routeProvider

      .when('/', {
        templateUrl: 'pages/main.html',
        controller: "mainCtrl"
      })

      .when('/repo/:user/:repo', {
        templateUrl: 'pages/repo-details.html',
        controller: "issueCtrl"
      });

  })
  .run(function($rootScope){

    /**
     * Github provides a special Link header on paginated API responses
     * based on: https://gist.github.com/niallo/3109252#gistcomment-1474669 
     *
     * @param {String} header GitHub Link header
     */
    $rootScope._parseLinkHeader = function _parseLinkHeader(header) {
      if (header.length === 0) {
        throw new Error("input must not be of zero length");
      }
      var parts = header.split(',');
      var links = {};
      for(var i=0; i<parts.length; i++) {
        var section = parts[i].split(';');
        if (section.length !== 2) {
          throw new Error("section could not be split on ';'");
        }
        var url = section[0].replace(/<(.*)>/, '$1').trim();
        var name = section[1].replace(/rel="(.*)"/, '$1').trim();
        links[name] = url;
      }
      return links;
    }

    /**
     * @param {Object} links hash, as returned by `_parseLinkHeader`
     */
    $rootScope._getNrOfPages = function _getNrOfPages(links) {
      if(links.last) {
        var regex = /&page=(\d+)/;
        var match = links.last.match(regex);
        return match ? match[1] : 1;
      }
    }

    /**
     * Parses GitHub-specific `headers` and adds them to a `headerinfo` property
     * on the `dst` object
     *
     * @param {Object} dst destination object, which will be extended
     * @param {Object} headers as returned by `$resource`s `transformResponse`
     */
    $rootScope.extendWithHeaderInfo = function extendWithHeaderInfo(dst, headers) {

      dst.headerInfo = {};

      dst.headerInfo.pagination = {};
      if(headers['link']) {
        var links = $rootScope._parseLinkHeader(headers['link']);
        dst.headerInfo.pagination.nrOfPages = $rootScope._getNrOfPages(links);
        dst.headerInfo.pagination.nextPage = links.next || null;
      }

      dst.headerInfo.rateLimit = {};
      if(headers['x-ratelimit-limit']){
        dst.headerInfo.rateLimit.limit = parseInt(headers['x-ratelimit-limit']);
      }
      if(headers['x-ratelimit-remaining']){
        dst.headerInfo.rateLimit.remaining = parseInt(headers['x-ratelimit-remaining']);
      }
    }
  });

GitHubApp.factory('RepoService', ['$rootScope', '$resource',
  function($rootScope, $resource) {

    var repoService = {};

    repoService._repos = [];

    repoService._resource = $resource(
      "https://api.github.com/search/repositories?q=:q", {}, {
        query: {
          isArray: true,
          transformResponse: function(data, headers){
            return JSON.parse(data).items;
          },
          interceptor: {
            response: function(data) {
              $rootScope.extendWithHeaderInfo(repoService, data.headers());
              return data.data;
            }
          }
        }
      }           
    );

    repoService.search = function query(query) {
      return repoService._resource.query({
        q: query
      }).$promise;
    };

    repoService.setRepos = function setRepos(repos) {
      repoService._repos = repos;
    }

    repoService.getNextPage = function getNextPage() {
      console.log(repoService.headerInfo);
      var nextPageResource = $resource(repoService.headerInfo.pagination.nextPage, {}, {
        query: {
          isArray: true,
          transformResponse: function(data, headers){
            return JSON.parse(data).items;
          },
          interceptor: {
            response: function(data) {
              $rootScope.extendWithHeaderInfo(repoService, data.headers());
              return data.data;
            }
          }
        }
      });
      return nextPageResource.query().$promise;
    }           

    return repoService;
  }
]);

GitHubApp.factory('IssueService', ['$rootScope', '$resource',
  function($rootScope, $resource){

    var issueService = {};

    issueService._resource = $resource(
      "https://api.github.com/repos/:userName/:repoName/issues",{}, {
        query: {
          isArray: true,
          interceptor: {
            response: function(data) {
              $rootScope.extendWithHeaderInfo(issueService, data.headers());
              return data.data;
            }
          }
        }
      }
    );

    issueService.search = function query(user, repo, url) {
      return issueService._resource.query({
        userName: user,
        repoName: repo
      }).$promise;
    };

    return issueService;
  }
]);

GitHubApp.controller('mainCtrl', ['$scope', '$location', '$routeParams', 'RepoService',
  function($scope, $location, $routeParams, RepoService){

    $scope.repos = RepoService._repos;
    $scope.headerInfo = RepoService.headerInfo;

    $scope.queryRepos = function() {
      $scope.repos = [];
      RepoService.search($scope.query).then(function(repos){
        RepoService._repos = repos;
        $scope.headerInfo = RepoService.headerInfo;
        $scope.repos = repos;
      });
    }

    $scope.queryNextPage = function() {
      if(RepoService.headerInfo.pagination.nextPage) {
        RepoService.getNextPage().then(function(repos){
          RepoService._repos = RepoService._repos.concat(repos);
          $scope.headerInfo = RepoService.headerInfo;
          $scope.repos = RepoService._repos;
        });
      }
    }
  }
]);

GitHubApp.controller('issueCtrl', ['$scope', '$routeParams', '$location', 'IssueService',
  function($scope, $routeParams, $location, IssueService){

    var params = $routeParams;

    IssueService.search(params.user, params.repo).then(function(issues){
      $scope.issues = issues;
      $scope.headerInfo = IssueService.headerInfo;
    });

  }
]);

GitHubApp.directive("repoDirective", function(){
  return {
    restrict: "AE",
    templateUrl: "directives/repo.html",
    replace: true,
    scope: {
      repo: "="
    }
  }
});

GitHubApp.directive("issueDirective", function(){
  return {
    restrict: "AE",
    template: '<a href="{{ issue.html_url }}" class="list-group-item">{{ issue.title }}</a>',
    replace: true,
    scope: {
      issue: "="
    }
  }
});

// from: http://codepen.io/TheLarkInn/blog/angularjs-directive-labs-ngenterkey 
GitHubApp.directive('dlEnterKey', function() {
  return function(scope, element, attrs) {
    element.bind("keydown keypress", function(event) {
      var keyCode = event.which || event.keyCode;
      if (keyCode === 13) {
        scope.$apply(function() {
          scope.$eval(attrs.dlEnterKey);
        });
        event.preventDefault();
      }
    });
  };
});
